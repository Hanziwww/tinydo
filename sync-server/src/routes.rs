use std::sync::Arc;

use axum::{
    extract::{Path, Query, State},
    http::{HeaderMap, StatusCode},
    response::IntoResponse,
    Json,
};
use rusqlite::params;
use serde::Deserialize;

use crate::db::{self, AppState};
use crate::models::*;

fn mask_key(key: &str) -> String {
    if key.len() <= 6 {
        return "***".to_string();
    }
    format!("{}...", &key[..6])
}

fn db_err<E: std::fmt::Display>(e: E) -> (StatusCode, Json<ErrorResponse>) {
    log::error!("[DB] {e}");
    (
        StatusCode::INTERNAL_SERVER_ERROR,
        Json(ErrorResponse {
            code: "DB_ERROR".into(),
            message: e.to_string(),
        }),
    )
}

fn invalid_device_err(device_id: &str) -> (StatusCode, Json<ErrorResponse>) {
    (
        StatusCode::FORBIDDEN,
        Json(ErrorResponse {
            code: "INVALID_DEVICE".into(),
            message: format!("Device \"{device_id}\" is not registered for this sync group"),
        }),
    )
}

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

pub async fn health() -> impl IntoResponse {
    Json(HealthResponse {
        status: "ok".into(),
        version: env!("CARGO_PKG_VERSION").into(),
    })
}

pub async fn register(
    State(state): State<Arc<AppState>>,
    Json(req): Json<RegisterRequest>,
) -> impl IntoResponse {
    let conn = state.db.lock().unwrap();

    db::ensure_sync_group(&conn, &req.sync_key);
    db::upsert_device(&conn, &req.device_id, &req.sync_key, &req.device_name);

    let head_version = db::get_current_version(&conn, &req.sync_key);
    let min_available_version = db::get_min_available_version(&conn, &req.sync_key);

    log::info!(
        "[REGISTER] device \"{}\" ({}) joined sync group \"{}\" at version {}",
        req.device_id,
        req.device_name,
        mask_key(&req.sync_key),
        head_version
    );

    Json(RegisterResponse {
        sync_key: req.sync_key,
        device_id: req.device_id,
        version: head_version,
        head_version,
        min_available_version,
    })
}

pub async fn push_changes(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(req): Json<PushChangesRequest>,
) -> Result<Json<PushChangesResponse>, (StatusCode, Json<ErrorResponse>)> {
    let sync_key = extract_sync_key(&headers)?;
    let conn = state.db.lock().unwrap();

    if !db::device_exists(&conn, &sync_key, &req.device_id) {
        return Err(invalid_device_err(&req.device_id));
    }

    let accepted = req.changes.len();

    let tx = conn.unchecked_transaction().map_err(db_err)?;
    db::touch_device(&tx, &sync_key, &req.device_id);
    let (start_version, end_version) = db::reserve_versions(&tx, &sync_key, accepted);
    let received_at = db::now_unix();
    let mut current_version = start_version;
    for change in &req.changes {
        current_version += 1;
        tx.execute(
            "INSERT INTO change_log (sync_key, device_id, entity_type, entity_id, action, encrypted, nonce, version, timestamp, received_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
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
                received_at,
            ],
        )
        .map_err(db_err)?;
    }
    tx.commit().map_err(db_err)?;

    log::info!(
        "[PUSH] device \"{}\" pushed {} changes (version {} -> {}) for sync group \"{}\"",
        req.device_id,
        accepted,
        start_version,
        end_version,
        mask_key(&sync_key)
    );

    Ok(Json(PushChangesResponse {
        version: end_version,
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
    let current_version = db::get_current_version(&conn, &sync_key);
    let min_available_version = db::get_min_available_version(&conn, &sync_key);

    if since < min_available_version {
        log::warn!(
            "[PULL] sync group \"{}\" requires snapshot for stale cursor {} (min available: {}, current: {})",
            mask_key(&sync_key),
            since,
            min_available_version,
            current_version
        );
        return Err((
            StatusCode::CONFLICT,
            Json(ErrorResponse {
                code: "SNAPSHOT_REQUIRED".into(),
                message: format!(
                    "Changes before version {} are no longer available; refresh from snapshot",
                    min_available_version
                ),
            }),
        ));
    }

    let mut stmt = conn
        .prepare(
            "SELECT id, device_id, entity_type, entity_id, action, encrypted, nonce, version, timestamp
             FROM change_log
             WHERE sync_key = ?1 AND version > ?2
             ORDER BY version ASC",
        )
        .map_err(db_err)?;

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
        .map_err(db_err)?
        .filter_map(|r| r.ok())
        .collect();

    log::info!(
        "[PULL] sync group \"{}\" returned {} changes since version {} (current: {})",
        mask_key(&sync_key),
        changes.len(),
        since,
        current_version
    );

    Ok(Json(PullChangesResponse {
        changes,
        current_version,
        head_version: current_version,
        min_available_version,
    }))
}

pub async fn upload_snapshot(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(req): Json<SnapshotUploadRequest>,
) -> Result<Json<SnapshotResponse>, (StatusCode, Json<ErrorResponse>)> {
    let sync_key = extract_sync_key(&headers)?;
    let conn = state.db.lock().unwrap();

    if !db::device_exists(&conn, &sync_key, &req.device_id) {
        return Err(invalid_device_err(&req.device_id));
    }
    db::touch_device(&conn, &sync_key, &req.device_id);

    let version = db::get_current_version(&conn, &sync_key);
    let now = db::now_unix();

    conn.execute(
        "INSERT INTO snapshots (sync_key, device_id, encrypted, nonce, version, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)
         ON CONFLICT(sync_key, version)
         DO UPDATE SET device_id = excluded.device_id,
                       encrypted = excluded.encrypted,
                       nonce = excluded.nonce,
                       created_at = excluded.created_at",
        params![
            sync_key,
            req.device_id,
            req.encrypted,
            req.nonce,
            version,
            now
        ],
    )
    .map_err(db_err)?;

    let pruned = db::prune_old_snapshots(&conn, &sync_key, 3);

    log::info!(
        "[SNAPSHOT] device \"{}\" uploaded snapshot version {} for sync group \"{}\"{}",
        req.device_id,
        version,
        mask_key(&sync_key),
        if pruned > 0 {
            format!(" (pruned {} old snapshots)", pruned)
        } else {
            String::new()
        }
    );

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
        Ok(snapshot) => {
            log::info!(
                "[SNAPSHOT] fetched latest snapshot (version {}) for sync group \"{}\"",
                snapshot.version,
                mask_key(&sync_key)
            );
            Ok(Json(Some(snapshot)))
        }
        Err(rusqlite::Error::QueryReturnedNoRows) => {
            log::info!(
                "[SNAPSHOT] no snapshot found for sync group \"{}\"",
                mask_key(&sync_key)
            );
            Ok(Json(None))
        }
        Err(e) => Err(db_err(e)),
    }
}

pub async fn status(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<StatusResponse>, (StatusCode, Json<ErrorResponse>)> {
    let sync_key = extract_sync_key(&headers)?;
    let conn = state.db.lock().unwrap();

    let current_version = db::get_current_version(&conn, &sync_key);
    let min_available_version = db::get_min_available_version(&conn, &sync_key);

    let mut stmt = conn
        .prepare("SELECT device_id, device_name, last_seen FROM devices WHERE sync_key = ?1")
        .map_err(db_err)?;

    let devices: Vec<DeviceInfo> = stmt
        .query_map(params![sync_key], |row| {
            Ok(DeviceInfo {
                device_id: row.get(0)?,
                device_name: row.get(1)?,
                last_seen: row.get(2)?,
            })
        })
        .map_err(db_err)?
        .filter_map(|r| r.ok())
        .collect();

    log::info!(
        "[STATUS] sync group \"{}\": version {}, {} devices",
        mask_key(&sync_key),
        current_version,
        devices.len()
    );

    Ok(Json(StatusResponse {
        sync_key,
        current_version,
        min_available_version,
        devices,
    }))
}

pub async fn cleanup(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(req): Json<CleanupRequest>,
) -> Result<Json<CleanupResponse>, (StatusCode, Json<ErrorResponse>)> {
    let sync_key = extract_sync_key(&headers)?;
    let conn = state.db.lock().unwrap();

    let removed = db::cleanup_old_changes(&conn, &sync_key, req.before_version);

    log::info!(
        "[CLEANUP] removed {} old changes (before version {}) for sync group \"{}\"",
        removed,
        req.before_version,
        mask_key(&sync_key)
    );

    Ok(Json(CleanupResponse { removed }))
}

pub async fn delete_device(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(device_id): Path<String>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ErrorResponse>)> {
    let sync_key = extract_sync_key(&headers)?;
    let conn = state.db.lock().unwrap();

    let removed = db::delete_device(&conn, &sync_key, &device_id);

    if removed > 0 {
        log::info!(
            "[DEVICE] removed device \"{}\" from sync group \"{}\"",
            device_id,
            mask_key(&sync_key)
        );
    } else {
        log::warn!(
            "[DEVICE] device \"{}\" not found in sync group \"{}\"",
            device_id,
            mask_key(&sync_key)
        );
    }

    Ok(Json(serde_json::json!({ "removed": removed > 0 })))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;

    fn test_state() -> Arc<AppState> {
        Arc::new(AppState {
            db: Mutex::new(crate::db::init_memory_db()),
        })
    }

    fn sync_headers(sync_key: &str) -> HeaderMap {
        let mut headers = HeaderMap::new();
        headers.insert("X-Sync-Key", sync_key.parse().unwrap());
        headers
    }

    #[tokio::test]
    async fn push_rejects_unregistered_device() {
        let state = test_state();
        {
            let conn = state.db.lock().unwrap();
            db::ensure_sync_group(&conn, "group-1");
        }

        let result = push_changes(
            State(state),
            sync_headers("group-1"),
            Json(PushChangesRequest {
                device_id: "device-1".into(),
                changes: vec![ChangeEntry {
                    entity_type: "todo".into(),
                    entity_id: "todo-1".into(),
                    action: "upsert".into(),
                    encrypted: "enc".into(),
                    nonce: "nonce".into(),
                    timestamp: 1,
                }],
            }),
        )
        .await;

        let Err((status, Json(body))) = result else {
            panic!("expected invalid device error");
        };
        assert_eq!(status, StatusCode::FORBIDDEN);
        assert_eq!(body.code, "INVALID_DEVICE");
    }

    #[tokio::test]
    async fn pull_requires_snapshot_for_stale_cursor() {
        let state = test_state();
        {
            let conn = state.db.lock().unwrap();
            db::ensure_sync_group(&conn, "group-1");
            conn.execute(
                "UPDATE sync_groups
                 SET current_version = 7, min_available_version = 3
                 WHERE sync_key = 'group-1'",
                [],
            )
            .unwrap();
        }

        let result = pull_changes(
            State(state),
            sync_headers("group-1"),
            Query(PullQuery {
                since_version: Some(2),
            }),
        )
        .await;

        let Err((status, Json(body))) = result else {
            panic!("expected snapshot required error");
        };
        assert_eq!(status, StatusCode::CONFLICT);
        assert_eq!(body.code, "SNAPSHOT_REQUIRED");
    }
}
