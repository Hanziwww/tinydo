use std::sync::Arc;

use axum::{
    extract::{Query, State},
    http::{HeaderMap, StatusCode},
    response::IntoResponse,
    Json,
};
use rusqlite::params;
use serde::Deserialize;

use crate::db::{self, AppState};
use crate::models::*;

fn extract_sync_key(headers: &HeaderMap) -> Result<String, (StatusCode, Json<ErrorResponse>)> {
    headers
        .get("X-Sync-Key")
        .and_then(|v| v.to_str().ok())
        .filter(|s| !s.trim().is_empty())
        .map(|s| s.to_string())
        .ok_or_else(|| {
            (
                StatusCode::UNAUTHORIZED,
                Json(ErrorResponse {
                    code: "MISSING_SYNC_KEY".into(),
                    message: "X-Sync-Key header is required".into(),
                }),
            )
        })
}

pub async fn register(
    State(state): State<Arc<AppState>>,
    Json(req): Json<RegisterRequest>,
) -> impl IntoResponse {
    let conn = state.db.lock().unwrap();

    db::ensure_sync_group(&conn, &req.sync_key);
    db::upsert_device(&conn, &req.device_id, &req.sync_key, &req.device_name);

    let version = db::get_current_version(&conn, &req.sync_key);

    Json(RegisterResponse {
        sync_key: req.sync_key,
        device_id: req.device_id,
        version,
    })
}

pub async fn push_changes(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(req): Json<PushChangesRequest>,
) -> Result<Json<PushChangesResponse>, (StatusCode, Json<ErrorResponse>)> {
    let sync_key = extract_sync_key(&headers)?;
    let conn = state.db.lock().unwrap();

    db::touch_device(&conn, &req.device_id);

    let mut current_version = db::get_current_version(&conn, &sync_key);
    let accepted = req.changes.len();

    for change in &req.changes {
        current_version += 1;
        conn.execute(
            "INSERT INTO change_log (sync_key, device_id, entity_type, entity_id, action, encrypted, nonce, version, timestamp)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![
                sync_key,
                req.device_id,
                change.entity_type,
                change.entity_id,
                change.action,
                change.encrypted,
                change.nonce,
                current_version,
                change.timestamp,
            ],
        )
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    code: "DB_ERROR".into(),
                    message: e.to_string(),
                }),
            )
        })?;
    }

    Ok(Json(PushChangesResponse {
        version: current_version,
        accepted,
    }))
}

#[derive(Deserialize)]
pub struct PullQuery {
    pub since_version: Option<i64>,
}

pub async fn pull_changes(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Query(query): Query<PullQuery>,
) -> Result<Json<PullChangesResponse>, (StatusCode, Json<ErrorResponse>)> {
    let sync_key = extract_sync_key(&headers)?;
    let conn = state.db.lock().unwrap();
    let since = query.since_version.unwrap_or(0);

    let mut stmt = conn
        .prepare(
            "SELECT id, device_id, entity_type, entity_id, action, encrypted, nonce, version, timestamp
             FROM change_log
             WHERE sync_key = ?1 AND version > ?2
             ORDER BY version ASC",
        )
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    code: "DB_ERROR".into(),
                    message: e.to_string(),
                }),
            )
        })?;

    let changes: Vec<StoredChange> = stmt
        .query_map(params![sync_key, since], |row| {
            Ok(StoredChange {
                id: row.get(0)?,
                device_id: row.get(1)?,
                entity_type: row.get(2)?,
                entity_id: row.get(3)?,
                action: row.get(4)?,
                encrypted: row.get(5)?,
                nonce: row.get(6)?,
                version: row.get(7)?,
                timestamp: row.get(8)?,
            })
        })
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    code: "DB_ERROR".into(),
                    message: e.to_string(),
                }),
            )
        })?
        .filter_map(|r| r.ok())
        .collect();

    let current_version = db::get_current_version(&conn, &sync_key);

    Ok(Json(PullChangesResponse {
        changes,
        current_version,
    }))
}

pub async fn upload_snapshot(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(req): Json<SnapshotUploadRequest>,
) -> Result<Json<SnapshotResponse>, (StatusCode, Json<ErrorResponse>)> {
    let sync_key = extract_sync_key(&headers)?;
    let conn = state.db.lock().unwrap();

    db::touch_device(&conn, &req.device_id);

    let version = db::get_current_version(&conn, &sync_key) + 1;
    let now = db::now_unix();

    conn.execute(
        "INSERT INTO snapshots (sync_key, device_id, encrypted, nonce, version, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![
            sync_key,
            req.device_id,
            req.encrypted,
            req.nonce,
            version,
            now
        ],
    )
    .map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                code: "DB_ERROR".into(),
                message: e.to_string(),
            }),
        )
    })?;

    Ok(Json(SnapshotResponse {
        version,
        device_id: req.device_id,
        encrypted: req.encrypted,
        nonce: req.nonce,
        created_at: now,
    }))
}

pub async fn get_latest_snapshot(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<Option<SnapshotResponse>>, (StatusCode, Json<ErrorResponse>)> {
    let sync_key = extract_sync_key(&headers)?;
    let conn = state.db.lock().unwrap();

    let result = conn.query_row(
        "SELECT version, device_id, encrypted, nonce, created_at
         FROM snapshots
         WHERE sync_key = ?1
         ORDER BY version DESC
         LIMIT 1",
        params![sync_key],
        |row| {
            Ok(SnapshotResponse {
                version: row.get(0)?,
                device_id: row.get(1)?,
                encrypted: row.get(2)?,
                nonce: row.get(3)?,
                created_at: row.get(4)?,
            })
        },
    );

    match result {
        Ok(snapshot) => Ok(Json(Some(snapshot))),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(Json(None)),
        Err(e) => Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                code: "DB_ERROR".into(),
                message: e.to_string(),
            }),
        )),
    }
}

pub async fn status(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<StatusResponse>, (StatusCode, Json<ErrorResponse>)> {
    let sync_key = extract_sync_key(&headers)?;
    let conn = state.db.lock().unwrap();

    let current_version = db::get_current_version(&conn, &sync_key);

    let mut stmt = conn
        .prepare("SELECT device_id, device_name, last_seen FROM devices WHERE sync_key = ?1")
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    code: "DB_ERROR".into(),
                    message: e.to_string(),
                }),
            )
        })?;

    let devices: Vec<DeviceInfo> = stmt
        .query_map(params![sync_key], |row| {
            Ok(DeviceInfo {
                device_id: row.get(0)?,
                device_name: row.get(1)?,
                last_seen: row.get(2)?,
            })
        })
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    code: "DB_ERROR".into(),
                    message: e.to_string(),
                }),
            )
        })?
        .filter_map(|r| r.ok())
        .collect();

    Ok(Json(StatusResponse {
        sync_key,
        current_version,
        devices,
    }))
}
