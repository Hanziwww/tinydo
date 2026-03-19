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
            sync_key              TEXT PRIMARY KEY,
            created_at            INTEGER NOT NULL,
            current_version       INTEGER NOT NULL DEFAULT 0,
            min_available_version INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS devices (
            sync_key    TEXT NOT NULL REFERENCES sync_groups(sync_key),
            device_id   TEXT NOT NULL,
            device_name TEXT NOT NULL,
            last_seen   INTEGER NOT NULL,
            PRIMARY KEY (sync_key, device_id)
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
            timestamp   INTEGER NOT NULL,
            received_at INTEGER NOT NULL DEFAULT 0
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

    migrate_schema(&conn);

    conn
}

pub fn now_unix() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64
}

fn table_has_column(conn: &Connection, table: &str, column: &str) -> bool {
    let pragma = format!("PRAGMA table_info({table})");
    let mut stmt = match conn.prepare(&pragma) {
        Ok(stmt) => stmt,
        Err(_) => return false,
    };

    let rows = match stmt.query_map([], |row| row.get::<_, String>(1)) {
        Ok(rows) => rows,
        Err(_) => return false,
    };

    let has_column = rows.filter_map(|row| row.ok()).any(|name| name == column);
    drop(stmt);
    has_column
}

fn ensure_column(conn: &Connection, table: &str, definition: &str, column: &str) {
    if table_has_column(conn, table, column) {
        return;
    }

    conn.execute_batch(&format!("ALTER TABLE {table} ADD COLUMN {definition}"))
        .expect("Failed to add missing column");
}

fn devices_table_needs_migration(conn: &Connection) -> bool {
    let mut stmt = match conn.prepare("PRAGMA table_info(devices)") {
        Ok(stmt) => stmt,
        Err(_) => return false,
    };

    let rows = match stmt.query_map([], |row| {
        Ok((row.get::<_, String>(1)?, row.get::<_, i64>(5)?))
    }) {
        Ok(rows) => rows,
        Err(_) => return false,
    };

    let mut pk_columns: Vec<(i64, String)> = rows
        .filter_map(|row| row.ok())
        .filter_map(|(name, pk)| if pk > 0 { Some((pk, name)) } else { None })
        .collect();
    pk_columns.sort_by_key(|(pk, _)| *pk);

    let pk_columns: Vec<String> = pk_columns.into_iter().map(|(_, name)| name).collect();

    pk_columns == vec!["device_id".to_string()]
}

fn migrate_devices_table(conn: &Connection) {
    if !devices_table_needs_migration(conn) {
        return;
    }

    conn.execute_batch(
        "
        PRAGMA foreign_keys=OFF;
        BEGIN IMMEDIATE;
        ALTER TABLE devices RENAME TO devices_legacy;
        CREATE TABLE devices (
            sync_key    TEXT NOT NULL REFERENCES sync_groups(sync_key),
            device_id   TEXT NOT NULL,
            device_name TEXT NOT NULL,
            last_seen   INTEGER NOT NULL,
            PRIMARY KEY (sync_key, device_id)
        );
        INSERT OR REPLACE INTO devices (sync_key, device_id, device_name, last_seen)
        SELECT sync_key, device_id, device_name, last_seen
        FROM devices_legacy;
        DROP TABLE devices_legacy;
        COMMIT;
        PRAGMA foreign_keys=ON;
        ",
    )
    .expect("Failed to migrate devices table");
}

fn migrate_schema(conn: &Connection) {
    ensure_column(
        conn,
        "sync_groups",
        "current_version INTEGER NOT NULL DEFAULT 0",
        "current_version",
    );
    ensure_column(
        conn,
        "sync_groups",
        "min_available_version INTEGER NOT NULL DEFAULT 0",
        "min_available_version",
    );
    ensure_column(
        conn,
        "change_log",
        "received_at INTEGER NOT NULL DEFAULT 0",
        "received_at",
    );
    conn.execute(
        "UPDATE change_log SET received_at = timestamp WHERE received_at = 0",
        [],
    )
    .ok();

    migrate_devices_table(conn);
    conn.execute_batch(
        "
        CREATE INDEX IF NOT EXISTS idx_change_log_sync_key_version
            ON change_log(sync_key, version);
        CREATE INDEX IF NOT EXISTS idx_devices_sync_key
            ON devices(sync_key);
        CREATE INDEX IF NOT EXISTS idx_snapshots_sync_key
            ON snapshots(sync_key, version);
        ",
    )
    .expect("Failed to ensure migrated indexes");
}

pub fn get_current_version(conn: &Connection, sync_key: &str) -> i64 {
    conn.query_row(
        "SELECT current_version FROM sync_groups WHERE sync_key = ?1",
        params![sync_key],
        |row| row.get(0),
    )
    .unwrap_or(0)
}

pub fn get_min_available_version(conn: &Connection, sync_key: &str) -> i64 {
    conn.query_row(
        "SELECT min_available_version FROM sync_groups WHERE sync_key = ?1",
        params![sync_key],
        |row| row.get(0),
    )
    .unwrap_or(0)
}

pub fn ensure_sync_group(conn: &Connection, sync_key: &str) {
    conn.execute(
        "INSERT OR IGNORE INTO sync_groups (sync_key, created_at, current_version, min_available_version)
         VALUES (?1, ?2, 0, 0)",
        params![sync_key, now_unix()],
    )
    .ok();
}

pub fn upsert_device(conn: &Connection, device_id: &str, sync_key: &str, device_name: &str) {
    conn.execute(
        "INSERT INTO devices (sync_key, device_id, device_name, last_seen) VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT(sync_key, device_id) DO UPDATE SET device_name = ?3, last_seen = ?4",
        params![sync_key, device_id, device_name, now_unix()],
    )
    .ok();
}

pub fn device_exists(conn: &Connection, sync_key: &str, device_id: &str) -> bool {
    conn.query_row(
        "SELECT 1 FROM devices WHERE sync_key = ?1 AND device_id = ?2",
        params![sync_key, device_id],
        |_| Ok(()),
    )
    .is_ok()
}

pub fn touch_device(conn: &Connection, sync_key: &str, device_id: &str) {
    conn.execute(
        "UPDATE devices SET last_seen = ?1 WHERE sync_key = ?2 AND device_id = ?3",
        params![now_unix(), sync_key, device_id],
    )
    .ok();
}

pub fn delete_device(conn: &Connection, sync_key: &str, device_id: &str) -> usize {
    conn.execute(
        "DELETE FROM devices WHERE sync_key = ?1 AND device_id = ?2",
        params![sync_key, device_id],
    )
    .unwrap_or(0)
}

pub fn reserve_versions(conn: &Connection, sync_key: &str, count: usize) -> (i64, i64) {
    let start_version = get_current_version(conn, sync_key);
    let end_version = start_version + count as i64;

    conn.execute(
        "UPDATE sync_groups SET current_version = ?2 WHERE sync_key = ?1",
        params![sync_key, end_version],
    )
    .ok();

    (start_version, end_version)
}

pub fn cleanup_old_changes(conn: &Connection, sync_key: &str, before_version: i64) -> usize {
    let removed = conn
        .execute(
            "DELETE FROM change_log WHERE sync_key = ?1 AND version <= ?2",
            params![sync_key, before_version],
        )
        .unwrap_or(0);

    let current = get_current_version(conn, sync_key);
    let next_min = before_version.min(current);
    conn.execute(
        "UPDATE sync_groups
         SET min_available_version = MAX(min_available_version, ?2)
         WHERE sync_key = ?1",
        params![sync_key, next_min],
    )
    .ok();

    removed
}

pub fn cleanup_stale_changes(conn: &Connection, max_age_secs: i64) -> usize {
    let cutoff = now_unix() - max_age_secs;
    let mut stmt = match conn.prepare(
        "SELECT sync_key, MAX(version)
         FROM change_log
         WHERE received_at < ?1
         GROUP BY sync_key",
    ) {
        Ok(stmt) => stmt,
        Err(_) => return 0,
    };

    let deleted_ranges: Vec<(String, i64)> = match stmt.query_map(params![cutoff], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
    }) {
        Ok(rows) => rows.filter_map(|row| row.ok()).collect(),
        Err(_) => return 0,
    };

    let removed = conn
        .execute(
            "DELETE FROM change_log WHERE received_at < ?1",
            params![cutoff],
        )
        .unwrap_or(0);

    for (sync_key, max_deleted_version) in deleted_ranges {
        let current = get_current_version(conn, &sync_key);
        let next_min = max_deleted_version.min(current);
        conn.execute(
            "UPDATE sync_groups
             SET min_available_version = MAX(min_available_version, ?2)
             WHERE sync_key = ?1",
            params![sync_key, next_min],
        )
        .ok();
    }

    removed
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
        CREATE TABLE sync_groups (
            sync_key TEXT PRIMARY KEY,
            created_at INTEGER NOT NULL,
            current_version INTEGER NOT NULL DEFAULT 0,
            min_available_version INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE devices (
            sync_key TEXT NOT NULL,
            device_id TEXT NOT NULL,
            device_name TEXT NOT NULL,
            last_seen INTEGER NOT NULL,
            PRIMARY KEY (sync_key, device_id)
        );
        CREATE TABLE snapshots (id INTEGER PRIMARY KEY AUTOINCREMENT, sync_key TEXT NOT NULL, device_id TEXT NOT NULL, encrypted TEXT NOT NULL, nonce TEXT NOT NULL, version INTEGER NOT NULL, created_at INTEGER NOT NULL, UNIQUE(sync_key, version));
        CREATE TABLE change_log (id INTEGER PRIMARY KEY AUTOINCREMENT, sync_key TEXT NOT NULL, device_id TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, action TEXT NOT NULL, encrypted TEXT NOT NULL, nonce TEXT NOT NULL, version INTEGER NOT NULL, timestamp INTEGER NOT NULL, received_at INTEGER NOT NULL DEFAULT 0);
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

        let current_version: i64 = conn
            .query_row(
                "SELECT current_version FROM sync_groups WHERE sync_key = 'test-key'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(current_version, 0);

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
                "SELECT device_name FROM devices WHERE sync_key = 'key1' AND device_id = 'dev1'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(name, "My PC");

        upsert_device(&conn, "dev1", "key1", "New Name");
        let name2: String = conn
            .query_row(
                "SELECT device_name FROM devices WHERE sync_key = 'key1' AND device_id = 'dev1'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(name2, "New Name");

        ensure_sync_group(&conn, "key2");
        upsert_device(&conn, "dev1", "key2", "Other Group");
        assert!(device_exists(&conn, "key1", "dev1"));
        assert!(device_exists(&conn, "key2", "dev1"));

        assert_eq!(delete_device(&conn, "key1", "dev1"), 1);
        assert!(!device_exists(&conn, "key1", "dev1"));
        assert!(device_exists(&conn, "key2", "dev1"));
        assert_eq!(delete_device(&conn, "key1", "dev1"), 0);
    }

    #[test]
    fn version_tracking() {
        let conn = init_memory_db();
        ensure_sync_group(&conn, "key1");
        assert_eq!(get_current_version(&conn, "key1"), 0);

        let (_, end1) = reserve_versions(&conn, "key1", 1);
        conn.execute(
            "INSERT INTO change_log (sync_key, device_id, entity_type, entity_id, action, encrypted, nonce, version, timestamp, received_at)
             VALUES ('key1', 'dev1', 'todo', 't1', 'upsert', 'enc', 'non', ?1, 100, 100)",
            params![end1],
        )
        .unwrap();
        assert_eq!(get_current_version(&conn, "key1"), 1);

        let (_, end2) = reserve_versions(&conn, "key1", 4);
        conn.execute(
            "INSERT INTO change_log (sync_key, device_id, entity_type, entity_id, action, encrypted, nonce, version, timestamp, received_at)
             VALUES ('key1', 'dev1', 'todo', 't2', 'upsert', 'enc', 'non', ?1, 200, 200)",
            params![end2],
        )
        .unwrap();
        assert_eq!(get_current_version(&conn, "key1"), 5);
        assert_eq!(get_min_available_version(&conn, "key1"), 0);

        assert_eq!(get_current_version(&conn, "other-key"), 0);
    }

    #[test]
    fn cleanup_old_changes_works() {
        let conn = init_memory_db();
        ensure_sync_group(&conn, "k1");
        conn.execute(
            "UPDATE sync_groups SET current_version = 5 WHERE sync_key = 'k1'",
            [],
        )
        .unwrap();
        for v in 1..=5 {
            conn.execute(
                "INSERT INTO change_log (sync_key, device_id, entity_type, entity_id, action, encrypted, nonce, version, timestamp, received_at)
                 VALUES ('k1', 'dev1', 'todo', 't1', 'upsert', 'enc', 'non', ?1, ?2, ?2)",
                params![v, now_unix()],
            )
            .unwrap();
        }
        assert_eq!(cleanup_old_changes(&conn, "k1", 3), 3);
        assert_eq!(get_current_version(&conn, "k1"), 5);
        assert_eq!(get_min_available_version(&conn, "k1"), 3);
    }

    #[test]
    fn cleanup_stale_changes_uses_received_at() {
        let conn = init_memory_db();
        ensure_sync_group(&conn, "k1");
        conn.execute(
            "UPDATE sync_groups SET current_version = 2 WHERE sync_key = 'k1'",
            [],
        )
        .unwrap();
        let now = now_unix();
        conn.execute(
            "INSERT INTO change_log (sync_key, device_id, entity_type, entity_id, action, encrypted, nonce, version, timestamp, received_at)
             VALUES ('k1', 'dev1', 'todo', 't1', 'upsert', 'enc', 'non', 1, ?1, ?2)",
            params![now - 1000, now],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO change_log (sync_key, device_id, entity_type, entity_id, action, encrypted, nonce, version, timestamp, received_at)
             VALUES ('k1', 'dev1', 'todo', 't2', 'upsert', 'enc', 'non', 2, ?1, ?2)",
            params![now, now - 1000],
        )
        .unwrap();

        assert_eq!(cleanup_stale_changes(&conn, 100), 1);
        assert_eq!(get_min_available_version(&conn, "k1"), 2);

        let remaining: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM change_log WHERE entity_id = 't1'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(remaining, 1);
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
