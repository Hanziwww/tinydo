pub mod client;
pub mod crypto;
pub mod engine;
pub mod models;

use base64::{engine::general_purpose::STANDARD as B64, Engine};
use tauri::{AppHandle, Emitter, Manager};

use crate::db::DbState;
use crate::error::AppError;
use crate::sync::client::SyncClient;
use crate::sync::engine::*;
use crate::sync::models::*;

fn generate_device_id() -> String {
    use rand::Rng;
    let mut rng = rand::thread_rng();
    let bytes: [u8; 16] = rng.gen();
    hex::encode(bytes)
}

fn generate_sync_key_value() -> String {
    use rand::Rng;
    let mut rng = rand::thread_rng();
    let bytes: [u8; 12] = rng.gen();
    B64.encode(bytes)
        .chars()
        .filter(|c| c.is_alphanumeric())
        .take(16)
        .collect()
}

fn get_hostname() -> String {
    hostname::get()
        .ok()
        .and_then(|h| h.into_string().ok())
        .unwrap_or_else(|| "Unknown Device".into())
}

#[tauri::command]
pub fn sync_generate_key() -> String {
    generate_sync_key_value()
}

#[tauri::command]
pub async fn sync_configure(
    app: AppHandle,
    server_url: String,
    sync_key: String,
) -> Result<SyncStatus, AppError> {
    let (device_id, device_name) = {
        let db = app.state::<DbState>();
        let conn = db.0.lock().unwrap();

        let device_id = get_sync_meta(&conn, "device_id").unwrap_or_else(generate_device_id);
        let device_name = get_hostname();

        set_sync_meta(&conn, "server_url", &server_url);
        set_sync_meta(&conn, "sync_key", &sync_key);
        set_sync_meta(&conn, "device_id", &device_id);
        set_sync_meta(&conn, "device_name", &device_name);

        (device_id, device_name)
    };

    let client = SyncClient::new(&server_url, &sync_key);
    let resp = client.register(&device_id, &device_name).await?;

    Ok(SyncStatus {
        configured: true,
        server_url,
        device_id,
        last_sync_version: resp.version,
        last_sync_time: 0,
        device_count: 1,
    })
}

#[tauri::command]
pub async fn sync_push(app: AppHandle) -> Result<usize, AppError> {
    let (client, sync_key, device_id, changes) = {
        let db = app.state::<DbState>();
        let conn = db.0.lock().unwrap();

        let server_url = get_sync_meta(&conn, "server_url")
            .ok_or_else(|| AppError::custom("Sync not configured"))?;
        let sync_key = get_sync_meta(&conn, "sync_key")
            .ok_or_else(|| AppError::custom("Sync not configured"))?;
        let device_id = get_sync_meta(&conn, "device_id")
            .ok_or_else(|| AppError::custom("Sync not configured"))?;

        let changes = get_unsynced_changes(&conn)?;
        let client = SyncClient::new(&server_url, &sync_key);

        (client, sync_key, device_id, changes)
    };

    if changes.is_empty() {
        return Ok(0);
    }

    let mut entries = Vec::new();
    for change in &changes {
        let data_bytes = change.data.as_deref().unwrap_or("").as_bytes();
        let (ciphertext, nonce) = crypto::encrypt(&sync_key, data_bytes)?;

        entries.push(ChangeEntry {
            entity_type: change.entity_type.clone(),
            entity_id: change.entity_id.clone(),
            action: change.action.clone(),
            encrypted: B64.encode(&ciphertext),
            nonce: B64.encode(&nonce),
            timestamp: change.timestamp,
        });
    }

    let resp = client.push_changes(&device_id, entries).await?;

    {
        let db = app.state::<DbState>();
        let conn = db.0.lock().unwrap();
        let ids: Vec<i64> = changes.iter().map(|c| c.id).collect();
        mark_changes_synced(&conn, &ids)?;
        clear_synced_changes(&conn)?;
        set_sync_meta(&conn, "last_sync_version", &resp.version.to_string());
    }

    Ok(resp.accepted)
}

#[tauri::command]
pub async fn sync_pull(app: AppHandle) -> Result<SyncResult, AppError> {
    let (client, sync_key, device_id, last_version, local_changes) = {
        let db = app.state::<DbState>();
        let conn = db.0.lock().unwrap();

        let server_url = get_sync_meta(&conn, "server_url")
            .ok_or_else(|| AppError::custom("Sync not configured"))?;
        let sync_key = get_sync_meta(&conn, "sync_key")
            .ok_or_else(|| AppError::custom("Sync not configured"))?;
        let device_id = get_sync_meta(&conn, "device_id")
            .ok_or_else(|| AppError::custom("Sync not configured"))?;
        let last_version = get_sync_meta(&conn, "last_sync_version")
            .and_then(|v| v.parse::<i64>().ok())
            .unwrap_or(0);
        let local_changes = get_unsynced_changes(&conn)?;

        let client = SyncClient::new(&server_url, &sync_key);
        (client, sync_key, device_id, last_version, local_changes)
    };

    let pull_resp = client.pull_changes(last_version).await?;

    let remote_changes: Vec<RemoteChange> = pull_resp
        .changes
        .into_iter()
        .filter(|c| c.device_id != device_id)
        .collect();

    let local_entity_keys: std::collections::HashMap<(String, String), &LocalChange> =
        local_changes
            .iter()
            .map(|c| ((c.entity_type.clone(), c.entity_id.clone()), c))
            .collect();

    let mut conflicts = Vec::new();
    let mut to_apply: Vec<(String, String, String, String)> = Vec::new();

    for remote in &remote_changes {
        let encrypted_bytes = B64
            .decode(&remote.encrypted)
            .map_err(|e| AppError::custom(format!("Base64 decode error: {e}")))?;
        let nonce_bytes = B64
            .decode(&remote.nonce)
            .map_err(|e| AppError::custom(format!("Base64 decode error: {e}")))?;

        let plaintext = crypto::decrypt(&sync_key, &encrypted_bytes, &nonce_bytes)?;
        let data = String::from_utf8(plaintext)
            .map_err(|e| AppError::custom(format!("UTF-8 error: {e}")))?;

        let entity_key = (remote.entity_type.clone(), remote.entity_id.clone());

        if let Some(local) = local_entity_keys.get(&entity_key) {
            conflicts.push(ConflictEntry {
                entity_type: remote.entity_type.clone(),
                entity_id: remote.entity_id.clone(),
                local_data: local.data.clone().unwrap_or_default(),
                remote_data: data,
                local_timestamp: local.timestamp,
                remote_timestamp: remote.timestamp,
            });
        } else {
            to_apply.push((
                remote.entity_type.clone(),
                remote.entity_id.clone(),
                remote.action.clone(),
                data,
            ));
        }
    }

    let conflict_keys: std::collections::HashSet<(String, String)> = conflicts
        .iter()
        .map(|c| (c.entity_type.clone(), c.entity_id.clone()))
        .collect();

    let pushable: Vec<&LocalChange> = local_changes
        .iter()
        .filter(|c| !conflict_keys.contains(&(c.entity_type.clone(), c.entity_id.clone())))
        .collect();

    let mut push_entries = Vec::new();
    let mut push_ids = Vec::new();
    for change in &pushable {
        let data_bytes = change.data.as_deref().unwrap_or("").as_bytes();
        let (ciphertext, nonce) = crypto::encrypt(&sync_key, data_bytes)?;

        push_entries.push(ChangeEntry {
            entity_type: change.entity_type.clone(),
            entity_id: change.entity_id.clone(),
            action: change.action.clone(),
            encrypted: B64.encode(&ciphertext),
            nonce: B64.encode(&nonce),
            timestamp: change.timestamp,
        });
        push_ids.push(change.id);
    }

    let pushed = if !push_entries.is_empty() {
        let resp = client.push_changes(&device_id, push_entries).await?;
        resp.accepted
    } else {
        0
    };

    let pulled = to_apply.len();
    {
        let db = app.state::<DbState>();
        let conn = db.0.lock().unwrap();

        for (entity_type, entity_id, action, data) in &to_apply {
            apply_remote_entity(&conn, entity_type, entity_id, action, data)?;
        }

        if !push_ids.is_empty() {
            mark_changes_synced(&conn, &push_ids)?;
            clear_synced_changes(&conn)?;
        }

        set_sync_meta(
            &conn,
            "last_sync_version",
            &pull_resp.current_version.to_string(),
        );

        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;
        set_sync_meta(&conn, "last_sync_time", &now.to_string());
    }

    let result = SyncResult {
        pulled,
        pushed,
        conflicts: conflicts.clone(),
        new_version: pull_resp.current_version,
    };

    if !conflicts.is_empty() {
        let _ = app.emit("sync-conflict", &conflicts);
    }
    let _ = app.emit("sync-completed", &result);

    Ok(result)
}

#[tauri::command]
pub async fn sync_full(app: AppHandle) -> Result<SyncResult, AppError> {
    sync_pull(app).await
}

#[tauri::command]
pub fn sync_get_status(app: AppHandle) -> Result<SyncStatus, AppError> {
    let db = app.state::<DbState>();
    let conn = db.0.lock().unwrap();

    let configured =
        get_sync_meta(&conn, "server_url").is_some() && get_sync_meta(&conn, "sync_key").is_some();

    Ok(SyncStatus {
        configured,
        server_url: get_sync_meta(&conn, "server_url").unwrap_or_default(),
        device_id: get_sync_meta(&conn, "device_id").unwrap_or_default(),
        last_sync_version: get_sync_meta(&conn, "last_sync_version")
            .and_then(|v| v.parse().ok())
            .unwrap_or(0),
        last_sync_time: get_sync_meta(&conn, "last_sync_time")
            .and_then(|v| v.parse().ok())
            .unwrap_or(0),
        device_count: 0,
    })
}

#[tauri::command]
pub fn sync_disconnect(app: AppHandle) -> Result<(), AppError> {
    let db = app.state::<DbState>();
    let conn = db.0.lock().unwrap();

    if let Some(url) = get_sync_meta(&conn, "server_url") {
        set_sync_meta(&conn, "prev_server_url", &url);
    }
    if let Some(key) = get_sync_meta(&conn, "sync_key") {
        set_sync_meta(&conn, "prev_sync_key", &key);
    }

    for key in &[
        "server_url",
        "sync_key",
        "device_id",
        "device_name",
        "last_sync_version",
        "last_sync_time",
    ] {
        conn.execute(
            "DELETE FROM sync_state WHERE key = ?1",
            rusqlite::params![key],
        )?;
    }
    conn.execute("DELETE FROM local_changes", [])?;

    Ok(())
}

#[tauri::command]
pub fn sync_get_last_config(app: AppHandle) -> Result<LastSyncConfig, AppError> {
    let db = app.state::<DbState>();
    let conn = db.0.lock().unwrap();

    Ok(LastSyncConfig {
        server_url: get_sync_meta(&conn, "prev_server_url").unwrap_or_default(),
        sync_key: get_sync_meta(&conn, "prev_sync_key").unwrap_or_default(),
    })
}

#[tauri::command]
pub fn sync_resolve_conflict(
    app: AppHandle,
    resolution: ConflictResolution,
    remote_data: String,
    local_data: String,
) -> Result<(), AppError> {
    let db = app.state::<DbState>();
    let conn = db.0.lock().unwrap();
    engine::resolve_conflict(&conn, &resolution, &remote_data, &local_data)
}
