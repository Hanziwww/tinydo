use rusqlite::{params, Connection};

use crate::error::AppError;
use crate::sync::models::*;

pub fn get_sync_meta(conn: &Connection, key: &str) -> Option<String> {
    conn.query_row(
        "SELECT value FROM sync_state WHERE key = ?1",
        params![key],
        |row| row.get(0),
    )
    .ok()
}

pub fn set_sync_meta(conn: &Connection, key: &str, value: &str) -> Result<(), AppError> {
    conn.execute(
        "INSERT OR REPLACE INTO sync_state (key, value) VALUES (?1, ?2)",
        params![key, value],
    )?;
    Ok(())
}

pub fn get_unsynced_changes(conn: &Connection) -> Result<Vec<LocalChange>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT id, entity_type, entity_id, action, data, timestamp
         FROM local_changes WHERE synced = 0 ORDER BY id ASC",
    )?;

    let changes = stmt
        .query_map([], |row| {
            Ok(LocalChange {
                id: row.get(0)?,
                entity_type: row.get(1)?,
                entity_id: row.get(2)?,
                action: row.get(3)?,
                data: row.get(4)?,
                timestamp: row.get(5)?,
            })
        })?
        .filter_map(|r| r.ok())
        .collect();

    Ok(changes)
}

pub fn mark_changes_synced(conn: &Connection, ids: &[i64]) -> Result<(), AppError> {
    for id in ids {
        conn.execute(
            "UPDATE local_changes SET synced = 1 WHERE id = ?1",
            params![id],
        )?;
    }
    Ok(())
}

pub fn clear_synced_changes(conn: &Connection) -> Result<(), AppError> {
    conn.execute("DELETE FROM local_changes WHERE synced = 1", [])?;
    Ok(())
}

pub fn clear_unsynced_changes_for_entity(
    conn: &Connection,
    entity_type: &str,
    entity_id: &str,
) -> Result<(), AppError> {
    conn.execute(
        "DELETE FROM local_changes WHERE entity_type = ?1 AND entity_id = ?2 AND synced = 0",
        params![entity_type, entity_id],
    )?;
    Ok(())
}

/// Record all existing entities as local changes so they get pushed on first sync.
pub fn seed_all_local_changes(conn: &Connection) -> Result<(), AppError> {
    conn.execute("DELETE FROM local_changes", [])?;

    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64;

    let mut stmt = conn.prepare("SELECT id, data, archived FROM todos")?;
    let todos: Vec<(String, String, bool)> = stmt
        .query_map([], |row| {
            Ok((row.get(0)?, row.get(1)?, row.get::<_, i32>(2)? != 0))
        })?
        .filter_map(|r| r.ok())
        .collect();
    for (id, data, archived) in &todos {
        let entity_type = if *archived { "archived_todo" } else { "todo" };
        conn.execute(
            "INSERT INTO local_changes (entity_type, entity_id, action, data, timestamp, synced) VALUES (?1, ?2, 'upsert', ?3, ?4, 0)",
            params![entity_type, id, data, timestamp],
        )?;
    }

    let mut stmt = conn.prepare("SELECT id, data FROM tags")?;
    let tags: Vec<(String, String)> = stmt
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?
        .filter_map(|r| r.ok())
        .collect();
    for (id, data) in &tags {
        conn.execute(
            "INSERT INTO local_changes (entity_type, entity_id, action, data, timestamp, synced) VALUES ('tag', ?1, 'upsert', ?2, ?3, 0)",
            params![id, data, timestamp],
        )?;
    }

    let mut stmt = conn.prepare("SELECT id, data FROM tag_groups")?;
    let groups: Vec<(String, String)> = stmt
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?
        .filter_map(|r| r.ok())
        .collect();
    for (id, data) in &groups {
        conn.execute(
            "INSERT INTO local_changes (entity_type, entity_id, action, data, timestamp, synced) VALUES ('tag_group', ?1, 'upsert', ?2, ?3, 0)",
            params![id, data, timestamp],
        )?;
    }

    let settings: Option<String> = conn
        .query_row(
            "SELECT value FROM settings WHERE key = 'app_settings'",
            [],
            |row| row.get(0),
        )
        .ok();
    if let Some(data) = &settings {
        conn.execute(
            "INSERT INTO local_changes (entity_type, entity_id, action, data, timestamp, synced) VALUES ('settings', 'app_settings', 'upsert', ?1, ?2, 0)",
            params![data, timestamp],
        )?;
    }

    Ok(())
}

pub fn record_local_change(
    conn: &Connection,
    entity_type: &str,
    entity_id: &str,
    action: &str,
    data: Option<&str>,
) -> Result<(), AppError> {
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64;

    conn.execute(
        "INSERT INTO local_changes (entity_type, entity_id, action, data, timestamp, synced)
         VALUES (?1, ?2, ?3, ?4, ?5, 0)",
        params![entity_type, entity_id, action, data, timestamp],
    )?;
    Ok(())
}

pub fn apply_remote_entity(
    conn: &Connection,
    entity_type: &str,
    entity_id: &str,
    action: &str,
    data: &str,
) -> Result<(), AppError> {
    match action {
        "upsert" => match entity_type {
            "todo" => {
                conn.execute(
                    "INSERT OR REPLACE INTO todos (id, data, archived) VALUES (?1, ?2, 0)",
                    params![entity_id, data],
                )?;
            }
            "archived_todo" => {
                conn.execute(
                    "INSERT OR REPLACE INTO todos (id, data, archived) VALUES (?1, ?2, 1)",
                    params![entity_id, data],
                )?;
            }
            "tag" => {
                conn.execute(
                    "INSERT OR REPLACE INTO tags (id, data) VALUES (?1, ?2)",
                    params![entity_id, data],
                )?;
            }
            "tag_group" => {
                conn.execute(
                    "INSERT OR REPLACE INTO tag_groups (id, data) VALUES (?1, ?2)",
                    params![entity_id, data],
                )?;
            }
            "settings" => {
                conn.execute(
                    "INSERT OR REPLACE INTO settings (key, value) VALUES ('app_settings', ?1)",
                    params![data],
                )?;
            }
            "event" => {
                let event: serde_json::Value = serde_json::from_str(data)?;
                let id = event["id"].as_str().unwrap_or(entity_id);
                let todo_id = event["todoId"].as_str().unwrap_or("");
                let event_type = event["eventType"].as_str().unwrap_or("created");
                let field = event["field"].as_str();
                let old_value = event.get("oldValue").map(|v| v.to_string());
                let new_value = event.get("newValue").map(|v| v.to_string());
                let timestamp = event["timestamp"].as_f64().unwrap_or(0.0);

                conn.execute(
                    "INSERT OR REPLACE INTO events (id, todo_id, event_type, field, old_value, new_value, timestamp)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                    params![id, todo_id, event_type, field, old_value, new_value, timestamp],
                )?;
            }
            _ => {}
        },
        "delete" => match entity_type {
            "todo" | "archived_todo" => {
                conn.execute("DELETE FROM todos WHERE id = ?1", params![entity_id])?;
            }
            "tag" => {
                conn.execute("DELETE FROM tags WHERE id = ?1", params![entity_id])?;
            }
            "tag_group" => {
                conn.execute("DELETE FROM tag_groups WHERE id = ?1", params![entity_id])?;
            }
            "event" => {
                conn.execute("DELETE FROM events WHERE id = ?1", params![entity_id])?;
            }
            _ => {}
        },
        _ => {}
    }
    Ok(())
}

pub fn resolve_conflict(
    conn: &Connection,
    resolution: &ConflictResolution,
    remote_data: &str,
    local_data: &str,
) -> Result<(), AppError> {
    let (action, data, requeue_local) = match resolution.keep.as_str() {
        "remote" => (&resolution.remote_action, remote_data, false),
        "local" => (&resolution.local_action, local_data, true),
        other => {
            return Err(AppError::custom(format!(
                "Unsupported conflict resolution strategy: {other}"
            )))
        }
    };

    apply_remote_entity(
        conn,
        &resolution.entity_type,
        &resolution.entity_id,
        action,
        data,
    )?;
    clear_unsynced_changes_for_entity(conn, &resolution.entity_type, &resolution.entity_id)?;

    if requeue_local {
        let next_data = if resolution.local_action == "delete" {
            None
        } else {
            Some(local_data)
        };
        record_local_change(
            conn,
            &resolution.entity_type,
            &resolution.entity_id,
            &resolution.local_action,
            next_data,
        )?;
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    fn test_conn() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "
            CREATE TABLE todos (id TEXT PRIMARY KEY, data TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0);
            CREATE TABLE tags (id TEXT PRIMARY KEY, data TEXT NOT NULL);
            CREATE TABLE tag_groups (id TEXT PRIMARY KEY, data TEXT NOT NULL);
            CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
            CREATE TABLE events (id TEXT PRIMARY KEY, todo_id TEXT NOT NULL, event_type TEXT NOT NULL, field TEXT, old_value TEXT, new_value TEXT, timestamp REAL NOT NULL);
            CREATE TABLE sync_state (key TEXT PRIMARY KEY, value TEXT NOT NULL);
            CREATE TABLE local_changes (id INTEGER PRIMARY KEY AUTOINCREMENT, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, action TEXT NOT NULL, data TEXT, timestamp INTEGER NOT NULL, synced INTEGER NOT NULL DEFAULT 0);
            CREATE INDEX idx_local_changes_synced ON local_changes(synced);
            ",
        )
        .unwrap();
        conn
    }

    #[test]
    fn sync_meta_roundtrip() {
        let conn = test_conn();
        assert!(get_sync_meta(&conn, "foo").is_none());
        set_sync_meta(&conn, "foo", "bar").unwrap();
        assert_eq!(get_sync_meta(&conn, "foo").unwrap(), "bar");
        set_sync_meta(&conn, "foo", "baz").unwrap();
        assert_eq!(get_sync_meta(&conn, "foo").unwrap(), "baz");
    }

    #[test]
    fn record_and_get_unsynced_changes() {
        let conn = test_conn();
        record_local_change(&conn, "todo", "t1", "upsert", Some(r#"{"id":"t1"}"#)).unwrap();
        record_local_change(&conn, "tag", "tag1", "delete", None).unwrap();

        let changes = get_unsynced_changes(&conn).unwrap();
        assert_eq!(changes.len(), 2);
        assert_eq!(changes[0].entity_type, "todo");
        assert_eq!(changes[1].entity_type, "tag");
    }

    #[test]
    fn mark_and_clear_synced() {
        let conn = test_conn();
        record_local_change(&conn, "todo", "t1", "upsert", Some("data")).unwrap();
        record_local_change(&conn, "todo", "t2", "upsert", Some("data")).unwrap();

        let changes = get_unsynced_changes(&conn).unwrap();
        assert_eq!(changes.len(), 2);

        mark_changes_synced(&conn, &[changes[0].id]).unwrap();

        let unsynced = get_unsynced_changes(&conn).unwrap();
        assert_eq!(unsynced.len(), 1);
        assert_eq!(unsynced[0].entity_id, "t2");

        clear_synced_changes(&conn).unwrap();
        let total: i64 = conn
            .query_row("SELECT COUNT(*) FROM local_changes", [], |row| row.get(0))
            .unwrap();
        assert_eq!(total, 1);
    }

    #[test]
    fn apply_remote_entity_upsert_todo() {
        let conn = test_conn();
        let data = r#"{"id":"t1","title":"Test","completed":false}"#;
        apply_remote_entity(&conn, "todo", "t1", "upsert", data).unwrap();

        let stored: String = conn
            .query_row("SELECT data FROM todos WHERE id = 't1'", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(stored, data);
    }

    #[test]
    fn apply_remote_entity_delete_todo() {
        let conn = test_conn();
        conn.execute(
            "INSERT INTO todos (id, data, archived) VALUES ('t1', '{}', 0)",
            [],
        )
        .unwrap();

        apply_remote_entity(&conn, "todo", "t1", "delete", "").unwrap();

        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM todos WHERE id = 't1'", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(count, 0);
    }

    #[test]
    fn apply_remote_entity_upsert_tag() {
        let conn = test_conn();
        apply_remote_entity(
            &conn,
            "tag",
            "tag1",
            "upsert",
            r#"{"id":"tag1","name":"Work"}"#,
        )
        .unwrap();

        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM tags", [], |row| row.get(0))
            .unwrap();
        assert_eq!(count, 1);
    }

    #[test]
    fn apply_remote_entity_upsert_settings() {
        let conn = test_conn();
        apply_remote_entity(
            &conn,
            "settings",
            "app_settings",
            "upsert",
            r#"{"theme":"light"}"#,
        )
        .unwrap();

        let val: String = conn
            .query_row(
                "SELECT value FROM settings WHERE key = 'app_settings'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert!(val.contains("light"));
    }

    #[test]
    fn resolve_conflict_keeps_local() {
        let conn = test_conn();
        record_local_change(
            &conn,
            "todo",
            "t1",
            "upsert",
            Some(r#"{"id":"t1","title":"Local"}"#),
        )
        .unwrap();

        let resolution = ConflictResolution {
            entity_type: "todo".into(),
            entity_id: "t1".into(),
            local_action: "upsert".into(),
            remote_action: "upsert".into(),
            keep: "local".into(),
        };

        resolve_conflict(
            &conn,
            &resolution,
            r#"{"id":"t1","title":"Remote"}"#,
            r#"{"id":"t1","title":"Local"}"#,
        )
        .unwrap();

        let data: String = conn
            .query_row("SELECT data FROM todos WHERE id = 't1'", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert!(data.contains("Local"));

        let unsynced = get_unsynced_changes(&conn).unwrap();
        assert_eq!(unsynced.len(), 1);
        assert_eq!(unsynced[0].action, "upsert");
    }

    #[test]
    fn resolve_conflict_keeps_remote() {
        let conn = test_conn();
        record_local_change(
            &conn,
            "todo",
            "t1",
            "upsert",
            Some(r#"{"id":"t1","title":"Local"}"#),
        )
        .unwrap();

        let resolution = ConflictResolution {
            entity_type: "todo".into(),
            entity_id: "t1".into(),
            local_action: "upsert".into(),
            remote_action: "upsert".into(),
            keep: "remote".into(),
        };

        resolve_conflict(
            &conn,
            &resolution,
            r#"{"id":"t1","title":"Remote"}"#,
            r#"{"id":"t1","title":"Local"}"#,
        )
        .unwrap();

        let data: String = conn
            .query_row("SELECT data FROM todos WHERE id = 't1'", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert!(data.contains("Remote"));

        let unsynced = get_unsynced_changes(&conn).unwrap();
        assert!(unsynced.is_empty());
    }

    #[test]
    fn resolve_conflict_keeps_local_delete() {
        let conn = test_conn();
        conn.execute(
            "INSERT INTO todos (id, data, archived) VALUES ('t1', '{\"id\":\"t1\"}', 0)",
            [],
        )
        .unwrap();
        record_local_change(&conn, "todo", "t1", "delete", None).unwrap();

        let resolution = ConflictResolution {
            entity_type: "todo".into(),
            entity_id: "t1".into(),
            local_action: "delete".into(),
            remote_action: "upsert".into(),
            keep: "local".into(),
        };

        resolve_conflict(&conn, &resolution, r#"{"id":"t1","title":"Remote"}"#, "").unwrap();

        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM todos WHERE id = 't1'", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(count, 0);

        let unsynced = get_unsynced_changes(&conn).unwrap();
        assert_eq!(unsynced.len(), 1);
        assert_eq!(unsynced[0].action, "delete");
    }
}
