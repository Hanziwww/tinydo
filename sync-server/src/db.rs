use std::sync::Mutex;

use rusqlite::{params, Connection};

pub struct AppState {
    pub db: Mutex<Connection>,
}

pub fn init_db(db_path: &str) -> Connection {
    let conn = Connection::open(db_path).expect("Failed to open database");

    conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")
        .expect("Failed to set pragmas");

    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS sync_groups (
            sync_key    TEXT PRIMARY KEY,
            created_at  INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS devices (
            device_id   TEXT PRIMARY KEY,
            sync_key    TEXT NOT NULL REFERENCES sync_groups(sync_key),
            device_name TEXT NOT NULL,
            last_seen   INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS snapshots (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            sync_key    TEXT NOT NULL REFERENCES sync_groups(sync_key),
            device_id   TEXT NOT NULL,
            encrypted   TEXT NOT NULL,
            nonce       TEXT NOT NULL,
            version     INTEGER NOT NULL,
            created_at  INTEGER NOT NULL,
            UNIQUE(sync_key, version)
        );

        CREATE TABLE IF NOT EXISTS change_log (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            sync_key    TEXT NOT NULL,
            device_id   TEXT NOT NULL,
            entity_type TEXT NOT NULL,
            entity_id   TEXT NOT NULL,
            action      TEXT NOT NULL,
            encrypted   TEXT NOT NULL,
            nonce       TEXT NOT NULL,
            version     INTEGER NOT NULL,
            timestamp   INTEGER NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_change_log_sync_key_version
            ON change_log(sync_key, version);
        CREATE INDEX IF NOT EXISTS idx_devices_sync_key
            ON devices(sync_key);
        CREATE INDEX IF NOT EXISTS idx_snapshots_sync_key
            ON snapshots(sync_key, version);
        ",
    )
    .expect("Failed to create tables");

    conn
}

pub fn now_unix() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64
}

pub fn get_current_version(conn: &Connection, sync_key: &str) -> i64 {
    conn.query_row(
        "SELECT COALESCE(MAX(version), 0) FROM change_log WHERE sync_key = ?1",
        params![sync_key],
        |row| row.get(0),
    )
    .unwrap_or(0)
}

pub fn ensure_sync_group(conn: &Connection, sync_key: &str) {
    conn.execute(
        "INSERT OR IGNORE INTO sync_groups (sync_key, created_at) VALUES (?1, ?2)",
        params![sync_key, now_unix()],
    )
    .ok();
}

pub fn upsert_device(conn: &Connection, device_id: &str, sync_key: &str, device_name: &str) {
    conn.execute(
        "INSERT INTO devices (device_id, sync_key, device_name, last_seen) VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT(device_id) DO UPDATE SET sync_key = ?2, device_name = ?3, last_seen = ?4",
        params![device_id, sync_key, device_name, now_unix()],
    )
    .ok();
}

pub fn touch_device(conn: &Connection, device_id: &str) {
    conn.execute(
        "UPDATE devices SET last_seen = ?1 WHERE device_id = ?2",
        params![now_unix(), device_id],
    )
    .ok();
}

pub fn delete_device(conn: &Connection, device_id: &str) -> usize {
    conn.execute(
        "DELETE FROM devices WHERE device_id = ?1",
        params![device_id],
    )
    .unwrap_or(0)
}

pub fn cleanup_old_changes(conn: &Connection, sync_key: &str, before_version: i64) -> usize {
    conn.execute(
        "DELETE FROM change_log WHERE sync_key = ?1 AND version <= ?2",
        params![sync_key, before_version],
    )
    .unwrap_or(0)
}

pub fn cleanup_stale_changes(conn: &Connection, max_age_secs: i64) -> usize {
    let cutoff = now_unix() - max_age_secs;
    conn.execute(
        "DELETE FROM change_log WHERE timestamp < ?1",
        params![cutoff],
    )
    .unwrap_or(0)
}

pub fn prune_old_snapshots(conn: &Connection, sync_key: &str, keep: i64) -> usize {
    conn.execute(
        "DELETE FROM snapshots WHERE sync_key = ?1 AND id NOT IN (
            SELECT id FROM snapshots WHERE sync_key = ?1 ORDER BY version DESC LIMIT ?2
         )",
        params![sync_key, keep],
    )
    .unwrap_or(0)
}

#[cfg(test)]
pub fn init_memory_db() -> Connection {
    let conn = Connection::open_in_memory().expect("Failed to open in-memory db");
    conn.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
    conn.execute_batch(
        "
        CREATE TABLE sync_groups (sync_key TEXT PRIMARY KEY, created_at INTEGER NOT NULL);
        CREATE TABLE devices (device_id TEXT PRIMARY KEY, sync_key TEXT NOT NULL, device_name TEXT NOT NULL, last_seen INTEGER NOT NULL);
        CREATE TABLE snapshots (id INTEGER PRIMARY KEY AUTOINCREMENT, sync_key TEXT NOT NULL, device_id TEXT NOT NULL, encrypted TEXT NOT NULL, nonce TEXT NOT NULL, version INTEGER NOT NULL, created_at INTEGER NOT NULL, UNIQUE(sync_key, version));
        CREATE TABLE change_log (id INTEGER PRIMARY KEY AUTOINCREMENT, sync_key TEXT NOT NULL, device_id TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, action TEXT NOT NULL, encrypted TEXT NOT NULL, nonce TEXT NOT NULL, version INTEGER NOT NULL, timestamp INTEGER NOT NULL);
        CREATE INDEX idx_change_log_sync_key_version ON change_log(sync_key, version);
        ",
    )
    .unwrap();
    conn
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sync_group_creation() {
        let conn = init_memory_db();
        ensure_sync_group(&conn, "test-key");

        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM sync_groups", [], |row| row.get(0))
            .unwrap();
        assert_eq!(count, 1);

        ensure_sync_group(&conn, "test-key");
        let count2: i64 = conn
            .query_row("SELECT COUNT(*) FROM sync_groups", [], |row| row.get(0))
            .unwrap();
        assert_eq!(count2, 1);
    }

    #[test]
    fn device_registration_and_delete() {
        let conn = init_memory_db();
        ensure_sync_group(&conn, "key1");
        upsert_device(&conn, "dev1", "key1", "My PC");

        let name: String = conn
            .query_row(
                "SELECT device_name FROM devices WHERE device_id = 'dev1'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(name, "My PC");

        upsert_device(&conn, "dev1", "key1", "New Name");
        let name2: String = conn
            .query_row(
                "SELECT device_name FROM devices WHERE device_id = 'dev1'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(name2, "New Name");

        assert_eq!(delete_device(&conn, "dev1"), 1);
        assert_eq!(delete_device(&conn, "dev1"), 0);
    }

    #[test]
    fn version_tracking() {
        let conn = init_memory_db();
        assert_eq!(get_current_version(&conn, "key1"), 0);

        conn.execute(
            "INSERT INTO change_log (sync_key, device_id, entity_type, entity_id, action, encrypted, nonce, version, timestamp)
             VALUES ('key1', 'dev1', 'todo', 't1', 'upsert', 'enc', 'non', 1, 100)",
            [],
        ).unwrap();
        assert_eq!(get_current_version(&conn, "key1"), 1);

        conn.execute(
            "INSERT INTO change_log (sync_key, device_id, entity_type, entity_id, action, encrypted, nonce, version, timestamp)
             VALUES ('key1', 'dev1', 'todo', 't2', 'upsert', 'enc', 'non', 5, 200)",
            [],
        ).unwrap();
        assert_eq!(get_current_version(&conn, "key1"), 5);

        assert_eq!(get_current_version(&conn, "other-key"), 0);
    }

    #[test]
    fn cleanup_old_changes_works() {
        let conn = init_memory_db();
        for v in 1..=5 {
            conn.execute(
                "INSERT INTO change_log (sync_key, device_id, entity_type, entity_id, action, encrypted, nonce, version, timestamp)
                 VALUES ('k1', 'dev1', 'todo', 't1', 'upsert', 'enc', 'non', ?1, ?2)",
                params![v, now_unix()],
            ).unwrap();
        }
        assert_eq!(cleanup_old_changes(&conn, "k1", 3), 3);
        assert_eq!(get_current_version(&conn, "k1"), 5);
    }

    #[test]
    fn prune_old_snapshots_works() {
        let conn = init_memory_db();
        ensure_sync_group(&conn, "k1");
        for v in 1..=5 {
            conn.execute(
                "INSERT INTO snapshots (sync_key, device_id, encrypted, nonce, version, created_at) VALUES ('k1', 'dev1', 'enc', 'non', ?1, ?2)",
                params![v, now_unix()],
            ).unwrap();
        }
        let pruned = prune_old_snapshots(&conn, "k1", 3);
        assert_eq!(pruned, 2);
        let remaining: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM snapshots WHERE sync_key = 'k1'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(remaining, 3);
    }
}
