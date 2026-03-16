use std::sync::Mutex;

use rusqlite::{params, Connection};

use crate::error::AppError;
use crate::models::*;

pub struct DbState(pub Mutex<Connection>);

pub fn init_db(db_path: &std::path::Path) -> Result<Connection, AppError> {
    if let Some(parent) = db_path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let conn = Connection::open(db_path)?;

    conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")?;

    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS todos (
            id       TEXT PRIMARY KEY,
            data     TEXT NOT NULL,
            archived INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS tags (
            id   TEXT PRIMARY KEY,
            data TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS tag_groups (
            id   TEXT PRIMARY KEY,
            data TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS settings (
            key   TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS meta (
            key   TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
        ",
    )?;

    log::info!("Database initialized at {:?}", db_path);
    Ok(conn)
}

// ── Meta helpers ───────────────────────────────────────────────────────

pub fn get_meta(conn: &Connection, key: &str) -> Result<Option<String>, AppError> {
    let mut stmt = conn.prepare("SELECT value FROM meta WHERE key = ?1")?;
    let mut rows = stmt.query(params![key])?;
    match rows.next()? {
        Some(row) => Ok(Some(row.get(0)?)),
        None => Ok(None),
    }
}

pub fn set_meta(conn: &Connection, key: &str, value: &str) -> Result<(), AppError> {
    conn.execute(
        "INSERT OR REPLACE INTO meta (key, value) VALUES (?1, ?2)",
        params![key, value],
    )?;
    Ok(())
}

pub fn is_db_empty(conn: &Connection) -> Result<bool, AppError> {
    let count: i64 = conn.query_row(
        "SELECT (SELECT COUNT(*) FROM todos) + (SELECT COUNT(*) FROM tags)",
        [],
        |row| row.get(0),
    )?;
    Ok(count == 0)
}

// ── Todos ──────────────────────────────────────────────────────────────

pub fn get_todos(conn: &Connection, archived: bool) -> Result<Vec<Todo>, AppError> {
    let mut stmt = conn.prepare("SELECT data FROM todos WHERE archived = ?1")?;
    let archived_val: i32 = if archived { 1 } else { 0 };
    let rows = stmt.query_map(params![archived_val], |row| {
        let data: String = row.get(0)?;
        Ok(data)
    })?;

    let mut todos = Vec::new();
    for row in rows {
        let data = row?;
        let todo: Todo = serde_json::from_str(&data)?;
        todos.push(todo);
    }
    Ok(todos)
}

pub fn save_todo(conn: &Connection, todo: &Todo, archived: bool) -> Result<(), AppError> {
    let data = serde_json::to_string(todo)?;
    let archived_val: i32 = if archived { 1 } else { 0 };
    conn.execute(
        "INSERT OR REPLACE INTO todos (id, data, archived) VALUES (?1, ?2, ?3)",
        params![todo.id, data, archived_val],
    )?;
    Ok(())
}

pub fn save_todos(conn: &Connection, todos: &[Todo], archived: bool) -> Result<(), AppError> {
    let tx = conn.unchecked_transaction()?;
    for todo in todos {
        save_todo(&tx, todo, archived)?;
    }
    tx.commit()?;
    Ok(())
}

pub fn delete_todo(conn: &Connection, id: &str) -> Result<(), AppError> {
    conn.execute("DELETE FROM todos WHERE id = ?1", params![id])?;
    Ok(())
}

pub fn archive_todos(conn: &Connection, ids: &[String]) -> Result<(), AppError> {
    let tx = conn.unchecked_transaction()?;
    for id in ids {
        tx.execute("UPDATE todos SET archived = 1 WHERE id = ?1", params![id])?;
    }
    tx.commit()?;
    Ok(())
}

// ── Tags ───────────────────────────────────────────────────────────────

pub fn get_tags(conn: &Connection) -> Result<Vec<Tag>, AppError> {
    let mut stmt = conn.prepare("SELECT data FROM tags")?;
    let rows = stmt.query_map([], |row| {
        let data: String = row.get(0)?;
        Ok(data)
    })?;

    let mut tags = Vec::new();
    for row in rows {
        let data = row?;
        let tag: Tag = serde_json::from_str(&data)?;
        tags.push(tag);
    }
    Ok(tags)
}

pub fn save_tag(conn: &Connection, tag: &Tag) -> Result<(), AppError> {
    let data = serde_json::to_string(tag)?;
    conn.execute(
        "INSERT OR REPLACE INTO tags (id, data) VALUES (?1, ?2)",
        params![tag.id, data],
    )?;
    Ok(())
}

pub fn delete_tag(conn: &Connection, id: &str) -> Result<(), AppError> {
    conn.execute("DELETE FROM tags WHERE id = ?1", params![id])?;
    Ok(())
}

// ── Tag Groups ─────────────────────────────────────────────────────────

pub fn get_tag_groups(conn: &Connection) -> Result<Vec<TagGroup>, AppError> {
    let mut stmt = conn.prepare("SELECT data FROM tag_groups")?;
    let rows = stmt.query_map([], |row| {
        let data: String = row.get(0)?;
        Ok(data)
    })?;

    let mut groups = Vec::new();
    for row in rows {
        let data = row?;
        let group: TagGroup = serde_json::from_str(&data)?;
        groups.push(group);
    }
    Ok(groups)
}

pub fn save_tag_group(conn: &Connection, group: &TagGroup) -> Result<(), AppError> {
    let data = serde_json::to_string(group)?;
    conn.execute(
        "INSERT OR REPLACE INTO tag_groups (id, data) VALUES (?1, ?2)",
        params![group.id, data],
    )?;
    Ok(())
}

pub fn delete_tag_group(conn: &Connection, id: &str) -> Result<(), AppError> {
    conn.execute("DELETE FROM tag_groups WHERE id = ?1", params![id])?;
    Ok(())
}

// ── Settings ───────────────────────────────────────────────────────────

pub fn get_settings(conn: &Connection) -> Result<Settings, AppError> {
    let mut stmt = conn.prepare("SELECT value FROM settings WHERE key = 'app_settings'")?;
    let mut rows = stmt.query([])?;
    match rows.next()? {
        Some(row) => {
            let data: String = row.get(0)?;
            let settings: Settings = serde_json::from_str(&data)?;
            Ok(settings)
        }
        None => Ok(Settings::default()),
    }
}

pub fn save_settings(conn: &Connection, settings: &Settings) -> Result<(), AppError> {
    let data = serde_json::to_string(settings)?;
    conn.execute(
        "INSERT OR REPLACE INTO settings (key, value) VALUES ('app_settings', ?1)",
        params![data],
    )?;
    Ok(())
}

// ── Bulk clear (for import replace mode) ───────────────────────────────

pub fn clear_todos(conn: &Connection) -> Result<(), AppError> {
    conn.execute("DELETE FROM todos", [])?;
    Ok(())
}

pub fn clear_tags(conn: &Connection) -> Result<(), AppError> {
    conn.execute("DELETE FROM tags", [])?;
    Ok(())
}

pub fn clear_tag_groups(conn: &Connection) -> Result<(), AppError> {
    conn.execute("DELETE FROM tag_groups", [])?;
    Ok(())
}

// ── Bulk migration ─────────────────────────────────────────────────────

pub fn migrate_from_legacy(conn: &Connection, data: &LegacyData) -> Result<(), AppError> {
    let tx = conn.unchecked_transaction()?;

    for todo in &data.todos {
        save_todo(&tx, todo, false)?;
    }
    for todo in &data.archived_todos {
        save_todo(&tx, todo, true)?;
    }
    for tag in &data.tags {
        save_tag(&tx, tag)?;
    }
    for group in &data.tag_groups {
        save_tag_group(&tx, group)?;
    }
    save_settings(&tx, &data.settings)?;
    set_meta(&tx, "migrated_from_legacy", "true")?;
    set_meta(&tx, "schema_version", "1")?;

    tx.commit()?;
    log::info!(
        "Legacy migration complete: {} todos, {} archived, {} tags, {} groups",
        data.todos.len(),
        data.archived_todos.len(),
        data.tags.len(),
        data.tag_groups.len(),
    );
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_conn() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "
            CREATE TABLE todos (id TEXT PRIMARY KEY, data TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0);
            CREATE TABLE tags (id TEXT PRIMARY KEY, data TEXT NOT NULL);
            CREATE TABLE tag_groups (id TEXT PRIMARY KEY, data TEXT NOT NULL);
            CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
            CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
            ",
        )
        .unwrap();
        conn
    }

    fn sample_todo(id: &str) -> Todo {
        Todo {
            id: id.into(),
            title: "Test todo".into(),
            completed: false,
            tag_ids: vec![],
            difficulty: 2,
            time_slots: vec![],
            reminder_mins_before: None,
            target_date: "2026-03-16".into(),
            order: 0.0,
            created_at: 0.0,
            subtasks: vec![],
            duration_days: 1,
            completed_day_keys: vec![],
        }
    }

    #[test]
    fn todo_crud() {
        let conn = test_conn();

        save_todo(&conn, &sample_todo("t1"), false).unwrap();
        save_todo(&conn, &sample_todo("t2"), false).unwrap();
        save_todo(&conn, &sample_todo("a1"), true).unwrap();

        let active = get_todos(&conn, false).unwrap();
        assert_eq!(active.len(), 2);

        let archived = get_todos(&conn, true).unwrap();
        assert_eq!(archived.len(), 1);

        delete_todo(&conn, "t1").unwrap();
        let active = get_todos(&conn, false).unwrap();
        assert_eq!(active.len(), 1);
    }

    #[test]
    fn todo_archive() {
        let conn = test_conn();
        save_todo(&conn, &sample_todo("t1"), false).unwrap();
        save_todo(&conn, &sample_todo("t2"), false).unwrap();

        archive_todos(&conn, &["t1".into()]).unwrap();

        let active = get_todos(&conn, false).unwrap();
        assert_eq!(active.len(), 1);
        assert_eq!(active[0].id, "t2");

        let archived = get_todos(&conn, true).unwrap();
        assert_eq!(archived.len(), 1);
        assert_eq!(archived[0].id, "t1");
    }

    #[test]
    fn todo_save_batch() {
        let conn = test_conn();
        let todos = vec![sample_todo("t1"), sample_todo("t2"), sample_todo("t3")];
        save_todos(&conn, &todos, false).unwrap();

        let result = get_todos(&conn, false).unwrap();
        assert_eq!(result.len(), 3);
    }

    #[test]
    fn tag_crud() {
        let conn = test_conn();

        let tag = Tag {
            id: "tag1".into(),
            name: "Test".into(),
            color: "#ff0000".into(),
            group_id: None,
        };
        save_tag(&conn, &tag).unwrap();

        let tags = get_tags(&conn).unwrap();
        assert_eq!(tags.len(), 1);
        assert_eq!(tags[0].name, "Test");

        delete_tag(&conn, "tag1").unwrap();
        let tags = get_tags(&conn).unwrap();
        assert!(tags.is_empty());
    }

    #[test]
    fn tag_group_crud() {
        let conn = test_conn();

        let group = TagGroup {
            id: "grp1".into(),
            name: "Work".into(),
            order: 0,
        };
        save_tag_group(&conn, &group).unwrap();

        let groups = get_tag_groups(&conn).unwrap();
        assert_eq!(groups.len(), 1);

        delete_tag_group(&conn, "grp1").unwrap();
        let groups = get_tag_groups(&conn).unwrap();
        assert!(groups.is_empty());
    }

    #[test]
    fn settings_default_and_save() {
        let conn = test_conn();

        let settings = get_settings(&conn).unwrap();
        assert_eq!(settings.theme, "dark");

        let mut settings = settings;
        settings.theme = "light".into();
        settings.user_name = "Alice".into();
        save_settings(&conn, &settings).unwrap();

        let loaded = get_settings(&conn).unwrap();
        assert_eq!(loaded.theme, "light");
        assert_eq!(loaded.user_name, "Alice");
    }

    #[test]
    fn meta_get_set() {
        let conn = test_conn();

        assert!(get_meta(&conn, "foo").unwrap().is_none());
        set_meta(&conn, "foo", "bar").unwrap();
        assert_eq!(get_meta(&conn, "foo").unwrap().unwrap(), "bar");
    }

    #[test]
    fn is_db_empty_works() {
        let conn = test_conn();
        assert!(is_db_empty(&conn).unwrap());

        save_todo(&conn, &sample_todo("t1"), false).unwrap();
        assert!(!is_db_empty(&conn).unwrap());
    }

    #[test]
    fn legacy_migration() {
        let conn = test_conn();

        let data = LegacyData {
            todos: vec![sample_todo("t1"), sample_todo("t2")],
            archived_todos: vec![sample_todo("a1")],
            tags: vec![Tag {
                id: "tag1".into(),
                name: "Tag".into(),
                color: "#000".into(),
                group_id: None,
            }],
            tag_groups: vec![TagGroup {
                id: "grp1".into(),
                name: "Group".into(),
                order: 0,
            }],
            settings: Settings::default(),
        };

        migrate_from_legacy(&conn, &data).unwrap();

        assert_eq!(get_todos(&conn, false).unwrap().len(), 2);
        assert_eq!(get_todos(&conn, true).unwrap().len(), 1);
        assert_eq!(get_tags(&conn).unwrap().len(), 1);
        assert_eq!(get_tag_groups(&conn).unwrap().len(), 1);
        assert_eq!(
            get_meta(&conn, "migrated_from_legacy").unwrap().unwrap(),
            "true"
        );
    }

    #[test]
    fn todo_upsert_overwrites() {
        let conn = test_conn();

        let mut todo = sample_todo("t1");
        save_todo(&conn, &todo, false).unwrap();

        todo.title = "Updated".into();
        todo.completed = true;
        save_todo(&conn, &todo, false).unwrap();

        let todos = get_todos(&conn, false).unwrap();
        assert_eq!(todos.len(), 1);
        assert_eq!(todos[0].title, "Updated");
        assert!(todos[0].completed);
    }

    #[test]
    fn clear_todos_removes_all() {
        let conn = test_conn();
        save_todo(&conn, &sample_todo("t1"), false).unwrap();
        save_todo(&conn, &sample_todo("t2"), false).unwrap();
        save_todo(&conn, &sample_todo("a1"), true).unwrap();

        clear_todos(&conn).unwrap();
        assert!(get_todos(&conn, false).unwrap().is_empty());
        assert!(get_todos(&conn, true).unwrap().is_empty());
    }

    #[test]
    fn clear_tags_removes_all() {
        let conn = test_conn();
        save_tag(
            &conn,
            &Tag {
                id: "t1".into(),
                name: "A".into(),
                color: "#000".into(),
                group_id: None,
            },
        )
        .unwrap();

        clear_tags(&conn).unwrap();
        assert!(get_tags(&conn).unwrap().is_empty());
    }

    #[test]
    fn clear_tag_groups_removes_all() {
        let conn = test_conn();
        save_tag_group(
            &conn,
            &TagGroup {
                id: "g1".into(),
                name: "G".into(),
                order: 0,
            },
        )
        .unwrap();

        clear_tag_groups(&conn).unwrap();
        assert!(get_tag_groups(&conn).unwrap().is_empty());
    }

    #[test]
    fn migration_preserves_all_data_types() {
        let conn = test_conn();

        let data = LegacyData {
            todos: vec![sample_todo("t1")],
            archived_todos: vec![sample_todo("a1")],
            tags: vec![
                Tag {
                    id: "tag1".into(),
                    name: "Work".into(),
                    color: "#f00".into(),
                    group_id: Some("grp1".into()),
                },
                Tag {
                    id: "tag2".into(),
                    name: "Life".into(),
                    color: "#0f0".into(),
                    group_id: None,
                },
            ],
            tag_groups: vec![TagGroup {
                id: "grp1".into(),
                name: "Category".into(),
                order: 0,
            }],
            settings: Settings {
                theme: "light".into(),
                locale: "en".into(),
                ..Settings::default()
            },
        };

        migrate_from_legacy(&conn, &data).unwrap();

        assert_eq!(get_todos(&conn, false).unwrap().len(), 1);
        assert_eq!(get_todos(&conn, true).unwrap().len(), 1);
        assert_eq!(get_tags(&conn).unwrap().len(), 2);
        assert_eq!(get_tag_groups(&conn).unwrap().len(), 1);

        let settings = get_settings(&conn).unwrap();
        assert_eq!(settings.theme, "light");
        assert_eq!(settings.locale, "en");
        assert!(settings.show_timeline); // default preserved
    }
}
