pub mod client;
pub mod crypto;
pub mod engine;
pub mod models;

use base64::{engine::general_purpose::STANDARD as B64, Engine};
use tauri::{AppHandle, Emitter, Manager};

use crate::commands::export::{build_export_envelope, import_json_to_db};
use crate::db::DbState;
use crate::error::AppError;
use crate::reminders;
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

fn now_unix_secs() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64
}

fn build_change_entry(sync_key: &str, change: &LocalChange) -> Result<ChangeEntry, AppError> {
    let data_bytes = change.data.as_deref().unwrap_or("").as_bytes();
    let (ciphertext, nonce) = crypto::encrypt(sync_key, data_bytes)?;

    Ok(ChangeEntry {
        entity_type: change.entity_type.clone(),
        entity_id: change.entity_id.clone(),
        action: change.action.clone(),
        encrypted: B64.encode(&ciphertext),
        nonce: B64.encode(&nonce),
        timestamp: change.timestamp,
    })
}

fn resolve_new_version(pull_version: i64, pushed_version: Option<i64>) -> i64 {
    pushed_version.map_or(pull_version, |version| pull_version.max(version))
}

type EntityKey = (String, String);
type PendingRemoteApply = (i64, String, String, String, String);

fn should_bootstrap_from_snapshot(
    last_version: i64,
    local_changes: &[LocalChange],
    status: &StatusResponse,
) -> bool {
    last_version < status.min_available_version
        || (last_version == 0 && status.current_version > 0 && local_changes.is_empty())
}

fn load_sync_context(
    app: &AppHandle,
) -> Result<(SyncClient, String, String, i64, Vec<LocalChange>), AppError> {
    let db = app.state::<DbState>();
    let conn = db.0.lock().unwrap();

    let server_url = get_sync_meta(&conn, "server_url")
        .ok_or_else(|| AppError::custom("Sync not configured"))?;
    let sync_key =
        get_sync_meta(&conn, "sync_key").ok_or_else(|| AppError::custom("Sync not configured"))?;
    let device_id =
        get_sync_meta(&conn, "device_id").ok_or_else(|| AppError::custom("Sync not configured"))?;
    let last_version = get_sync_meta(&conn, "last_sync_version")
        .and_then(|v| v.parse::<i64>().ok())
        .unwrap_or(0);
    let local_changes = get_unsynced_changes(&conn)?;
    let client = SyncClient::new(&server_url, &sync_key);

    Ok((client, sync_key, device_id, last_version, local_changes))
}

fn apply_snapshot_payload(
    conn: &rusqlite::Connection,
    sync_key: &str,
    snapshot: &SnapshotResponse,
) -> Result<(), AppError> {
    let encrypted_bytes = B64.decode(&snapshot.encrypted)?;
    let nonce_bytes = B64.decode(&snapshot.nonce)?;
    let plaintext = crypto::decrypt(sync_key, &encrypted_bytes, &nonce_bytes)?;
    let payload: serde_json::Value = serde_json::from_slice(&plaintext)?;

    import_json_to_db(conn, &payload)?;
    set_sync_meta(conn, "last_sync_version", &snapshot.version.to_string())?;
    set_sync_meta(conn, "last_sync_time", &now_unix_secs().to_string())?;
    Ok(())
}

async fn bootstrap_from_snapshot_if_needed(
    app: &AppHandle,
    client: &SyncClient,
    sync_key: &str,
    last_version: i64,
    local_changes: &[LocalChange],
    status: &StatusResponse,
) -> Result<bool, AppError> {
    let snapshot_required = last_version < status.min_available_version;
    if !should_bootstrap_from_snapshot(last_version, local_changes, status) {
        return Ok(false);
    }

    let snapshot = match client.get_latest_snapshot().await? {
        Some(snapshot) => snapshot,
        None if snapshot_required => {
            return Err(AppError::custom(
                "服务器缺少可用快照，无法恢复同步。请先让另一台已同步的设备完成一次同步。",
            ))
        }
        None => return Ok(false),
    };

    if snapshot_required && snapshot.version < status.min_available_version {
        return Err(AppError::custom(
            "服务器上的最新快照已经过期，无法恢复同步。请先让另一台设备完成一次同步并生成新快照。",
        ));
    }

    if snapshot.version <= last_version {
        if snapshot_required {
            return Err(AppError::custom(
                "服务器上的快照版本过旧，无法恢复同步。请先让另一台设备完成一次同步并生成新快照。",
            ));
        }
        return Ok(false);
    }

    {
        let db = app.state::<DbState>();
        let conn = db.0.lock().unwrap();
        apply_snapshot_payload(&conn, sync_key, &snapshot)?;
    }

    Ok(true)
}

async fn upload_snapshot_for_current_state(
    app: &AppHandle,
    client: &SyncClient,
    sync_key: &str,
    device_id: &str,
) -> Result<(), AppError> {
    let payload = {
        let db = app.state::<DbState>();
        let conn = db.0.lock().unwrap();
        build_export_envelope(&conn)?
    };
    let plaintext = serde_json::to_vec(&payload)?;
    let (ciphertext, nonce) = crypto::encrypt(sync_key, &plaintext)?;

    client
        .upload_snapshot(device_id, B64.encode(&ciphertext), B64.encode(&nonce))
        .await?;
    Ok(())
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

        (device_id, device_name)
    };

    let client = SyncClient::new(&server_url, &sync_key);
    client.register(&device_id, &device_name).await?;

    {
        let db = app.state::<DbState>();
        let conn = db.0.lock().unwrap();
        set_sync_meta(&conn, "server_url", &server_url)?;
        set_sync_meta(&conn, "sync_key", &sync_key)?;
        set_sync_meta(&conn, "device_id", &device_id)?;
        set_sync_meta(&conn, "device_name", &device_name)?;
        set_sync_meta(&conn, "last_sync_version", "0")?;
        set_sync_meta(&conn, "last_sync_time", "0")?;
        seed_all_local_changes(&conn)?;
    }

    Ok(SyncStatus {
        configured: true,
        server_url,
        device_id,
        last_sync_version: 0,
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
        entries.push(build_change_entry(&sync_key, change)?);
    }

    let resp = client.push_changes(&device_id, entries).await?;

    {
        let db = app.state::<DbState>();
        let conn = db.0.lock().unwrap();
        let ids: Vec<i64> = changes.iter().map(|c| c.id).collect();
        mark_changes_synced(&conn, &ids)?;
        clear_synced_changes(&conn)?;
        set_sync_meta(&conn, "last_sync_version", &resp.version.to_string())?;
        set_sync_meta(&conn, "last_sync_time", &now_unix_secs().to_string())?;
    }

    Ok(resp.accepted)
}

#[tauri::command]
pub async fn sync_pull(app: AppHandle) -> Result<SyncResult, AppError> {
    let (client, sync_key, device_id, last_version, local_changes) = load_sync_context(&app)?;

    let pull_resp = client.pull_changes(last_version).await?;

    let remote_changes: Vec<RemoteChange> = pull_resp
        .changes
        .into_iter()
        .filter(|c| c.device_id != device_id)
        .collect();

    let local_entity_keys: std::collections::HashMap<EntityKey, &LocalChange> = local_changes
        .iter()
        .map(|c| ((c.entity_type.clone(), c.entity_id.clone()), c))
        .collect();

    let mut conflicts_by_key: std::collections::HashMap<EntityKey, ConflictEntry> =
        std::collections::HashMap::new();
    let mut to_apply_by_key: std::collections::HashMap<EntityKey, PendingRemoteApply> =
        std::collections::HashMap::new();

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
            conflicts_by_key.insert(
                entity_key,
                ConflictEntry {
                    entity_type: remote.entity_type.clone(),
                    entity_id: remote.entity_id.clone(),
                    local_action: local.action.clone(),
                    remote_action: remote.action.clone(),
                    local_data: local.data.clone().unwrap_or_default(),
                    remote_data: data,
                    local_timestamp: local.timestamp,
                    remote_timestamp: remote.timestamp,
                    remote_version: remote.version,
                },
            );
        } else {
            to_apply_by_key.insert(
                entity_key,
                (
                    remote.version,
                    remote.entity_type.clone(),
                    remote.entity_id.clone(),
                    remote.action.clone(),
                    data,
                ),
            );
        }
    }

    let mut conflicts: Vec<ConflictEntry> = conflicts_by_key.into_values().collect();
    conflicts.sort_by_key(|conflict| conflict.remote_version);

    let mut to_apply_with_version: Vec<PendingRemoteApply> =
        to_apply_by_key.into_values().collect();
    to_apply_with_version.sort_by_key(|(version, ..)| *version);
    let to_apply: Vec<(String, String, String, String)> = to_apply_with_version
        .into_iter()
        .map(|(_, entity_type, entity_id, action, data)| (entity_type, entity_id, action, data))
        .collect();

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
        push_entries.push(build_change_entry(&sync_key, change)?);
        push_ids.push(change.id);
    }

    let (pushed, pushed_version) = if !push_entries.is_empty() {
        let resp = client.push_changes(&device_id, push_entries).await?;
        (resp.accepted, Some(resp.version))
    } else {
        (0, None)
    };

    let pulled = to_apply.len();
    let new_version = resolve_new_version(pull_resp.current_version, pushed_version);
    {
        let db = app.state::<DbState>();
        let conn = db.0.lock().unwrap();
        let tx = conn.unchecked_transaction()?;

        for (entity_type, entity_id, action, data) in &to_apply {
            apply_remote_entity(&tx, entity_type, entity_id, action, data)?;
        }

        if !push_ids.is_empty() {
            mark_changes_synced(&tx, &push_ids)?;
            clear_synced_changes(&tx)?;
        }

        set_sync_meta(&tx, "last_sync_version", &new_version.to_string())?;
        set_sync_meta(&tx, "last_sync_time", &now_unix_secs().to_string())?;
        tx.commit()?;
    }

    let result = SyncResult {
        pulled,
        pushed,
        conflicts: conflicts.clone(),
        new_version,
    };

    if !conflicts.is_empty() {
        let _ = app.emit("sync-conflict", &conflicts);
    }
    let _ = app.emit("sync-completed", &result);

    if pulled > 0 {
        reminders::reschedule_all(&app);
    }

    Ok(result)
}

#[tauri::command]
pub async fn sync_full(app: AppHandle) -> Result<SyncResult, AppError> {
    let (client, sync_key, device_id, last_version, local_changes) = load_sync_context(&app)?;
    let status = client.get_status().await?;
    let snapshot_applied = bootstrap_from_snapshot_if_needed(
        &app,
        &client,
        &sync_key,
        last_version,
        &local_changes,
        &status,
    )
    .await?;

    let result = sync_pull(app.clone()).await?;

    if snapshot_applied && result.pulled == 0 {
        reminders::reschedule_all(&app);
    }

    if result.conflicts.is_empty() && (snapshot_applied || result.pulled > 0 || result.pushed > 0) {
        if let Err(error) =
            upload_snapshot_for_current_state(&app, &client, &sync_key, &device_id).await
        {
            log::warn!("Failed to upload sync snapshot: {error}");
        }
    }

    Ok(result)
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
        set_sync_meta(&conn, "prev_server_url", &url)?;
    }
    if let Some(key) = get_sync_meta(&conn, "sync_key") {
        set_sync_meta(&conn, "prev_sync_key", &key)?;
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db;
    use crate::models::{EventType, Settings, Tag, TinyEvent, Todo};

    fn temp_db_path(label: &str) -> std::path::PathBuf {
        std::env::temp_dir().join(format!("tinydo-sync-{label}-{}.db", rand::random::<u64>()))
    }

    fn sample_todo(id: &str, title: &str) -> Todo {
        Todo {
            id: id.into(),
            title: title.into(),
            completed: false,
            tag_ids: vec![],
            difficulty: 2,
            time_slots: vec![],
            reminder_mins_before: Some(10),
            target_date: "2026-03-19".into(),
            order: 0.0,
            created_at: 1.0,
            subtasks: vec![],
            duration_days: 1,
            completed_day_keys: vec![],
            archived_day_keys: vec![],
            outgoing_relations: vec![],
            history_date: None,
            history_source_todo_id: None,
            history_kind: None,
        }
    }

    #[test]
    fn resolve_new_version_prefers_push_head() {
        assert_eq!(resolve_new_version(39, Some(42)), 42);
        assert_eq!(resolve_new_version(39, Some(39)), 39);
        assert_eq!(resolve_new_version(39, None), 39);
    }

    #[test]
    fn bootstrap_only_for_stale_or_empty_new_device() {
        let stale_status = StatusResponse {
            sync_key: "key".into(),
            current_version: 12,
            min_available_version: 5,
            devices: vec![],
        };
        let fresh_status = StatusResponse {
            sync_key: "key".into(),
            current_version: 12,
            min_available_version: 0,
            devices: vec![],
        };
        let local_change = LocalChange {
            id: 1,
            entity_type: "todo".into(),
            entity_id: "t1".into(),
            action: "upsert".into(),
            data: Some("{}".into()),
            timestamp: 1,
        };

        assert!(should_bootstrap_from_snapshot(0, &[], &fresh_status));
        assert!(should_bootstrap_from_snapshot(
            4,
            std::slice::from_ref(&local_change),
            &stale_status
        ));
        assert!(!should_bootstrap_from_snapshot(
            0,
            &[local_change],
            &fresh_status
        ));
        assert!(!should_bootstrap_from_snapshot(8, &[], &fresh_status));
    }

    #[test]
    fn snapshot_roundtrip_restores_local_database() {
        let source_path = temp_db_path("source");
        let target_path = temp_db_path("target");

        {
            let source = db::init_db(&source_path).unwrap();
            db::save_todo(&source, &sample_todo("todo-1", "Snapshot Todo"), false).unwrap();
            db::save_tag(
                &source,
                &Tag {
                    id: "tag-1".into(),
                    name: "Work".into(),
                    color: "#6366f1".into(),
                    group_id: None,
                },
            )
            .unwrap();
            db::save_settings(
                &source,
                &Settings {
                    theme: "light".into(),
                    ..Settings::default()
                },
            )
            .unwrap();
            db::save_events(
                &source,
                &[TinyEvent {
                    id: "event-1".into(),
                    todo_id: "todo-1".into(),
                    event_type: EventType::Created,
                    field: None,
                    old_value: None,
                    new_value: Some(serde_json::json!({ "title": "Snapshot Todo" })),
                    timestamp: 1234.0,
                }],
            )
            .unwrap();

            let envelope = build_export_envelope(&source).unwrap();
            let payload = serde_json::to_vec(&envelope).unwrap();
            let (ciphertext, nonce) = crypto::encrypt("sync-key", &payload).unwrap();

            let target = db::init_db(&target_path).unwrap();
            apply_snapshot_payload(
                &target,
                "sync-key",
                &SnapshotResponse {
                    version: 9,
                    device_id: "device-1".into(),
                    encrypted: B64.encode(&ciphertext),
                    nonce: B64.encode(&nonce),
                    created_at: now_unix_secs(),
                },
            )
            .unwrap();

            let todos = db::get_todos(&target, false).unwrap();
            assert_eq!(todos.len(), 1);
            assert_eq!(todos[0].title, "Snapshot Todo");

            let tags = db::get_tags(&target).unwrap();
            assert_eq!(tags.len(), 1);
            assert_eq!(tags[0].name, "Work");

            let settings = db::get_settings(&target).unwrap();
            assert_eq!(settings.theme, "light");

            let events = db::get_all_events(&target).unwrap();
            assert_eq!(events.len(), 1);
            assert_eq!(events[0].id, "event-1");

            assert_eq!(
                get_sync_meta(&target, "last_sync_version").as_deref(),
                Some("9")
            );
        }

        let _ = std::fs::remove_file(source_path);
        let _ = std::fs::remove_file(target_path);
    }
}
