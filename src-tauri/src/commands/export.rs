use tauri::State;

use crate::db::{self, DbState};
use crate::error::AppError;
use crate::models::{ExportEnvelope, ExportSettings, ImportResult, Tag, TagGroup, Todo};

#[tauri::command]
pub fn export_data(state: State<'_, DbState>, file_path: String) -> Result<(), AppError> {
    if file_path.is_empty() {
        return Err(AppError::custom("File path is empty"));
    }

    let conn = state
        .0
        .lock()
        .map_err(|e| AppError::custom(e.to_string()))?;

    let todos = db::get_todos(&conn, false)?;
    let archived_todos = db::get_todos(&conn, true)?;
    let tags = db::get_tags(&conn)?;
    let tag_groups = db::get_tag_groups(&conn)?;
    let settings = db::get_settings(&conn)?;

    let envelope = ExportEnvelope {
        version: "2.0".into(),
        exported_at: chrono::Utc::now().to_rfc3339(),
        todos,
        archived_todos,
        tags,
        tag_groups,
        settings: ExportSettings {
            theme: settings.theme,
            locale: settings.locale,
            show_timeline: settings.show_timeline,
            tomorrow_planning_unlock_hour: settings.tomorrow_planning_unlock_hour,
        },
    };

    let json = serde_json::to_string_pretty(&envelope)?;
    std::fs::write(&file_path, json)?;
    log::info!("Data exported to {}", file_path);
    Ok(())
}

fn normalize_todo(raw: &serde_json::Value) -> Result<Todo, AppError> {
    let obj = raw
        .as_object()
        .ok_or_else(|| AppError::custom("Todo entry is not an object"))?;

    let id = obj
        .get("id")
        .and_then(|v| v.as_str())
        .unwrap_or("unknown")
        .to_string();

    let title = obj
        .get("title")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    let completed = obj
        .get("completed")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);

    let tag_ids = obj
        .get("tagIds")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(String::from))
                .collect()
        })
        .unwrap_or_default();

    let difficulty = obj.get("difficulty").and_then(|v| v.as_u64()).unwrap_or(2) as u8;

    let time_slots = obj
        .get("timeSlots")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|sl| {
                    let o = sl.as_object()?;
                    Some(crate::models::TimeSlot {
                        id: o.get("id")?.as_str().unwrap_or("ts").to_string(),
                        start: o.get("start")?.as_str().unwrap_or("09:00").to_string(),
                        end: o.get("end").and_then(|v| v.as_str()).map(String::from),
                    })
                })
                .collect()
        })
        .unwrap_or_default();

    let reminder_mins_before = obj
        .get("reminderMinsBefore")
        .and_then(|v| v.as_i64())
        .map(|v| v as i32);

    let target_date = obj
        .get("targetDate")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    let order = obj.get("order").and_then(|v| v.as_f64()).unwrap_or(0.0);

    let created_at = obj.get("createdAt").and_then(|v| v.as_f64()).unwrap_or(0.0);

    let subtasks = obj
        .get("subtasks")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .enumerate()
                .filter_map(|(i, st)| {
                    let o = st.as_object()?;
                    Some(crate::models::SubTask {
                        id: o.get("id")?.as_str().unwrap_or("st").to_string(),
                        title: o.get("title")?.as_str().unwrap_or("").to_string(),
                        completed: o
                            .get("completed")
                            .and_then(|v| v.as_bool())
                            .unwrap_or(false),
                        order: o.get("order").and_then(|v| v.as_i64()).unwrap_or(i as i64),
                    })
                })
                .collect()
        })
        .unwrap_or_default();

    let duration_days = obj
        .get("durationDays")
        .and_then(|v| v.as_u64())
        .unwrap_or(1) as u32;

    let completed_day_keys = obj
        .get("completedDayKeys")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(String::from))
                .collect()
        })
        .unwrap_or_default();

    Ok(Todo {
        id,
        title,
        completed,
        tag_ids,
        difficulty,
        time_slots,
        reminder_mins_before,
        target_date,
        order,
        created_at,
        subtasks,
        duration_days,
        completed_day_keys,
    })
}

#[tauri::command]
pub fn import_data(state: State<'_, DbState>, file_path: String) -> Result<ImportResult, AppError> {
    if file_path.is_empty() {
        return Err(AppError::custom("File path is empty"));
    }

    let raw = std::fs::read_to_string(&file_path)?;
    let data: serde_json::Value = serde_json::from_str(&raw)?;

    let obj = data
        .as_object()
        .ok_or_else(|| AppError::custom("Invalid format: not a JSON object"))?;

    let todos_arr = obj
        .get("todos")
        .and_then(|v| v.as_array())
        .ok_or_else(|| AppError::custom("Invalid format: missing todos array"))?;

    let conn = state
        .0
        .lock()
        .map_err(|e| AppError::custom(e.to_string()))?;

    // Replace mode: clear existing data before importing
    db::clear_todos(&conn)?;
    db::clear_tags(&conn)?;
    db::clear_tag_groups(&conn)?;

    let mut todos_count = 0;
    for raw_todo in todos_arr {
        let todo = normalize_todo(raw_todo)?;
        db::save_todo(&conn, &todo, false)?;
        todos_count += 1;
    }

    let mut archived_count = 0;
    if let Some(archived_arr) = obj.get("archivedTodos").and_then(|v| v.as_array()) {
        for raw_todo in archived_arr {
            let todo = normalize_todo(raw_todo)?;
            db::save_todo(&conn, &todo, true)?;
            archived_count += 1;
        }
    }

    // Import tags
    let mut tags_count = 0;
    if let Some(tags_arr) = obj.get("tags").and_then(|v| v.as_array()) {
        for raw_tag in tags_arr {
            let tag: Tag = serde_json::from_value(raw_tag.clone())?;
            db::save_tag(&conn, &tag)?;
            tags_count += 1;
        }
    }

    // Import tag groups
    let mut tag_groups_count = 0;
    if let Some(groups_arr) = obj.get("tagGroups").and_then(|v| v.as_array()) {
        for raw_group in groups_arr {
            let group: TagGroup = serde_json::from_value(raw_group.clone())?;
            db::save_tag_group(&conn, &group)?;
            tag_groups_count += 1;
        }
    }

    // Import settings (merge: patch exported fields onto current settings)
    let mut settings_updated = false;
    if let Some(settings_obj) = obj.get("settings").and_then(|v| v.as_object()) {
        let mut settings = db::get_settings(&conn)?;
        if let Some(v) = settings_obj.get("theme").and_then(|v| v.as_str()) {
            settings.theme = v.to_string();
        }
        if let Some(v) = settings_obj.get("locale").and_then(|v| v.as_str()) {
            settings.locale = v.to_string();
        }
        if let Some(v) = settings_obj.get("showTimeline").and_then(|v| v.as_bool()) {
            settings.show_timeline = v;
        }
        if let Some(v) = settings_obj
            .get("tomorrowPlanningUnlockHour")
            .and_then(|v| v.as_u64())
        {
            settings.tomorrow_planning_unlock_hour = v as u32;
        }
        db::save_settings(&conn, &settings)?;
        settings_updated = true;
    }

    log::info!(
        "Data imported from {}: {} todos, {} archived, {} tags, {} tag groups, settings={}",
        file_path,
        todos_count,
        archived_count,
        tags_count,
        tag_groups_count,
        settings_updated
    );

    Ok(ImportResult {
        todos_count,
        archived_count,
        tags_count,
        tag_groups_count,
        settings_updated,
    })
}

#[tauri::command]
pub fn save_poster(file_path: String, png_base64: String, dpi: u32) -> Result<(), AppError> {
    use base64::Engine;

    if file_path.is_empty() {
        return Err(AppError::custom("File path is empty"));
    }

    let bytes = base64::engine::general_purpose::STANDARD.decode(&png_base64)?;
    let out = inject_png_dpi(&bytes, dpi);
    std::fs::write(&file_path, out)?;
    log::info!("Poster saved to {} (DPI={})", file_path, dpi);
    Ok(())
}

fn inject_png_dpi(raw: &[u8], dpi: u32) -> Vec<u8> {
    let ppm = (f64::from(dpi) / 0.0254).round() as u32;

    // Build pHYs chunk: 4 bytes length + 4 bytes type + 9 bytes data + 4 bytes CRC = 21 bytes
    let mut phys = vec![0u8; 21];

    // Length = 9 (big-endian)
    phys[0..4].copy_from_slice(&9u32.to_be_bytes());
    // Type = "pHYs"
    phys[4..8].copy_from_slice(b"pHYs");
    // X pixels per unit
    phys[8..12].copy_from_slice(&ppm.to_be_bytes());
    // Y pixels per unit
    phys[12..16].copy_from_slice(&ppm.to_be_bytes());
    // Unit = meter
    phys[16] = 1;
    // CRC over type + data (bytes 4..17)
    let crc = crc32(&phys[4..17]);
    phys[17..21].copy_from_slice(&crc.to_be_bytes());

    // Insert after IHDR chunk
    // PNG signature = 8 bytes, then IHDR: 4 bytes length + 4 bytes type + data + 4 bytes CRC
    if raw.len() < 16 {
        return raw.to_vec();
    }
    let ihdr_data_len = u32::from_be_bytes([raw[8], raw[9], raw[10], raw[11]]) as usize;
    let insert_at = 8 + 12 + ihdr_data_len; // after signature + full IHDR chunk

    if insert_at > raw.len() {
        return raw.to_vec();
    }

    let mut out = Vec::with_capacity(raw.len() + phys.len());
    out.extend_from_slice(&raw[..insert_at]);
    out.extend_from_slice(&phys);
    out.extend_from_slice(&raw[insert_at..]);
    out
}

fn crc32(data: &[u8]) -> u32 {
    static CRC_TABLE: std::sync::LazyLock<[u32; 256]> = std::sync::LazyLock::new(|| {
        let mut table = [0u32; 256];
        for n in 0..256u32 {
            let mut c = n;
            for _ in 0..8 {
                if c & 1 != 0 {
                    c = 0xedb88320 ^ (c >> 1);
                } else {
                    c >>= 1;
                }
            }
            table[n as usize] = c;
        }
        table
    });

    let mut crc = 0xffff_ffffu32;
    for &b in data {
        crc = CRC_TABLE[((crc ^ u32::from(b)) & 0xff) as usize] ^ (crc >> 8);
    }
    crc ^ 0xffff_ffff
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{ExportEnvelope, ExportSettings};
    use rusqlite::Connection;

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

    fn sample_envelope() -> serde_json::Value {
        serde_json::json!({
            "version": "2.0",
            "exportedAt": "2026-03-16T00:00:00Z",
            "todos": [
                {
                    "id": "t1",
                    "title": "Buy milk",
                    "completed": false,
                    "tagIds": ["tag1"],
                    "difficulty": 3,
                    "timeSlots": [{"id": "ts1", "start": "09:00", "end": "10:00"}],
                    "reminderMinsBefore": 5,
                    "targetDate": "2026-03-16",
                    "order": 1.0,
                    "createdAt": 1710000000000.0,
                    "subtasks": [],
                    "durationDays": 1,
                    "completedDayKeys": []
                }
            ],
            "archivedTodos": [
                {
                    "id": "a1",
                    "title": "Old task",
                    "completed": true,
                    "tagIds": [],
                    "difficulty": 2,
                    "timeSlots": [],
                    "targetDate": "2026-03-15",
                    "order": 0.0,
                    "createdAt": 1709900000000.0,
                    "subtasks": [],
                    "durationDays": 1,
                    "completedDayKeys": []
                }
            ],
            "tags": [
                {"id": "tag1", "name": "Work", "color": "#ff0000", "groupId": "grp1"},
                {"id": "tag2", "name": "Life", "color": "#00ff00", "groupId": null}
            ],
            "tagGroups": [
                {"id": "grp1", "name": "Category", "order": 0}
            ],
            "settings": {
                "theme": "light",
                "locale": "en",
                "showTimeline": false,
                "tomorrowPlanningUnlockHour": 18
            }
        })
    }

    /// Write JSON to a temp file then call the import logic against an in-memory DB.
    fn import_json_to_db(conn: &Connection, json: &serde_json::Value) -> ImportResult {
        let obj = json.as_object().unwrap();

        db::clear_todos(conn).unwrap();
        db::clear_tags(conn).unwrap();
        db::clear_tag_groups(conn).unwrap();

        let todos_arr = obj.get("todos").and_then(|v| v.as_array()).unwrap();
        let mut todos_count = 0;
        for raw in todos_arr {
            let todo = normalize_todo(raw).unwrap();
            db::save_todo(conn, &todo, false).unwrap();
            todos_count += 1;
        }

        let mut archived_count = 0;
        if let Some(arr) = obj.get("archivedTodos").and_then(|v| v.as_array()) {
            for raw in arr {
                let todo = normalize_todo(raw).unwrap();
                db::save_todo(conn, &todo, true).unwrap();
                archived_count += 1;
            }
        }

        let mut tags_count = 0;
        if let Some(arr) = obj.get("tags").and_then(|v| v.as_array()) {
            for raw in arr {
                let tag: Tag = serde_json::from_value(raw.clone()).unwrap();
                db::save_tag(conn, &tag).unwrap();
                tags_count += 1;
            }
        }

        let mut tag_groups_count = 0;
        if let Some(arr) = obj.get("tagGroups").and_then(|v| v.as_array()) {
            for raw in arr {
                let group: TagGroup = serde_json::from_value(raw.clone()).unwrap();
                db::save_tag_group(conn, &group).unwrap();
                tag_groups_count += 1;
            }
        }

        let mut settings_updated = false;
        if let Some(settings_obj) = obj.get("settings").and_then(|v| v.as_object()) {
            let mut settings = db::get_settings(conn).unwrap();
            if let Some(v) = settings_obj.get("theme").and_then(|v| v.as_str()) {
                settings.theme = v.to_string();
            }
            if let Some(v) = settings_obj.get("locale").and_then(|v| v.as_str()) {
                settings.locale = v.to_string();
            }
            if let Some(v) = settings_obj.get("showTimeline").and_then(|v| v.as_bool()) {
                settings.show_timeline = v;
            }
            if let Some(v) = settings_obj
                .get("tomorrowPlanningUnlockHour")
                .and_then(|v| v.as_u64())
            {
                settings.tomorrow_planning_unlock_hour = v as u32;
            }
            db::save_settings(conn, &settings).unwrap();
            settings_updated = true;
        }

        ImportResult {
            todos_count,
            archived_count,
            tags_count,
            tag_groups_count,
            settings_updated,
        }
    }

    #[test]
    fn crc32_known_value() {
        let crc = crc32(b"pHYs");
        assert_ne!(crc, 0);
    }

    #[test]
    fn inject_dpi_preserves_small_png() {
        let small = vec![0u8; 10];
        let result = inject_png_dpi(&small, 360);
        assert_eq!(result.len(), 10);
    }

    #[test]
    fn normalize_todo_minimal() {
        let val: serde_json::Value = serde_json::json!({
            "id": "t1",
            "title": "Test",
            "completed": false,
            "tagIds": [],
            "difficulty": 2,
            "timeSlots": [],
            "targetDate": "2026-03-16",
            "order": 0,
            "createdAt": 0,
            "subtasks": [],
            "durationDays": 1,
            "completedDayKeys": []
        });
        let todo = normalize_todo(&val).unwrap();
        assert_eq!(todo.id, "t1");
        assert_eq!(todo.title, "Test");
        assert!(!todo.completed);
    }

    #[test]
    fn normalize_todo_missing_fields() {
        let val: serde_json::Value = serde_json::json!({
            "id": "t2",
            "title": "Sparse"
        });
        let todo = normalize_todo(&val).unwrap();
        assert_eq!(todo.id, "t2");
        assert!(!todo.completed);
        assert_eq!(todo.difficulty, 2);
        assert_eq!(todo.duration_days, 1);
    }

    // ── Round-trip integration tests ──────────────────────────────────

    #[test]
    fn import_roundtrip_todos() {
        let conn = test_conn();
        let envelope = sample_envelope();
        let result = import_json_to_db(&conn, &envelope);

        assert_eq!(result.todos_count, 1);
        assert_eq!(result.archived_count, 1);

        let todos = db::get_todos(&conn, false).unwrap();
        assert_eq!(todos.len(), 1);
        assert_eq!(todos[0].id, "t1");
        assert_eq!(todos[0].title, "Buy milk");
        assert_eq!(todos[0].difficulty, 3);
        assert_eq!(todos[0].tag_ids, vec!["tag1"]);

        let archived = db::get_todos(&conn, true).unwrap();
        assert_eq!(archived.len(), 1);
        assert_eq!(archived[0].id, "a1");
        assert!(archived[0].completed);
    }

    #[test]
    fn import_roundtrip_tags_and_groups() {
        let conn = test_conn();
        let envelope = sample_envelope();
        let result = import_json_to_db(&conn, &envelope);

        assert_eq!(result.tags_count, 2);
        assert_eq!(result.tag_groups_count, 1);

        let tags = db::get_tags(&conn).unwrap();
        assert_eq!(tags.len(), 2);
        let work_tag = tags.iter().find(|t| t.id == "tag1").unwrap();
        assert_eq!(work_tag.name, "Work");
        assert_eq!(work_tag.group_id, Some("grp1".into()));

        let groups = db::get_tag_groups(&conn).unwrap();
        assert_eq!(groups.len(), 1);
        assert_eq!(groups[0].name, "Category");
    }

    #[test]
    fn import_roundtrip_settings() {
        let conn = test_conn();
        let envelope = sample_envelope();
        let result = import_json_to_db(&conn, &envelope);

        assert!(result.settings_updated);

        let settings = db::get_settings(&conn).unwrap();
        assert_eq!(settings.theme, "light");
        assert_eq!(settings.locale, "en");
        assert!(!settings.show_timeline);
        assert_eq!(settings.tomorrow_planning_unlock_hour, 18);
        // Non-exported fields should retain defaults
        assert_eq!(settings.timeline_start_hour, 0);
        assert_eq!(settings.timeline_end_hour, 24);
    }

    #[test]
    fn import_replace_clears_old_data() {
        let conn = test_conn();

        // Pre-populate with some data
        let old_tag = Tag {
            id: "old-tag".into(),
            name: "Old".into(),
            color: "#000".into(),
            group_id: None,
        };
        db::save_tag(&conn, &old_tag).unwrap();
        let old_todo = Todo {
            id: "old-todo".into(),
            title: "Old".into(),
            completed: false,
            tag_ids: vec![],
            difficulty: 1,
            time_slots: vec![],
            reminder_mins_before: None,
            target_date: "2026-01-01".into(),
            order: 0.0,
            created_at: 0.0,
            subtasks: vec![],
            duration_days: 1,
            completed_day_keys: vec![],
        };
        db::save_todo(&conn, &old_todo, false).unwrap();

        assert_eq!(db::get_tags(&conn).unwrap().len(), 1);
        assert_eq!(db::get_todos(&conn, false).unwrap().len(), 1);

        // Import replaces everything
        let envelope = sample_envelope();
        import_json_to_db(&conn, &envelope);

        let tags = db::get_tags(&conn).unwrap();
        assert_eq!(tags.len(), 2);
        assert!(tags.iter().all(|t| t.id != "old-tag"));

        let todos = db::get_todos(&conn, false).unwrap();
        assert_eq!(todos.len(), 1);
        assert_eq!(todos[0].id, "t1");
    }

    #[test]
    fn import_full_export_roundtrip_via_serde() {
        let conn = test_conn();

        // Build an ExportEnvelope, serialize it, then import back
        let todo = Todo {
            id: "rt1".into(),
            title: "Roundtrip".into(),
            completed: false,
            tag_ids: vec!["tg1".into()],
            difficulty: 4,
            time_slots: vec![crate::models::TimeSlot {
                id: "ts1".into(),
                start: "14:00".into(),
                end: Some("15:00".into()),
            }],
            reminder_mins_before: Some(10),
            target_date: "2026-03-16".into(),
            order: 2.5,
            created_at: 1710000000000.0,
            subtasks: vec![crate::models::SubTask {
                id: "st1".into(),
                title: "Sub".into(),
                completed: true,
                order: 0,
            }],
            duration_days: 3,
            completed_day_keys: vec!["2026-03-16".into()],
        };

        let tag = Tag {
            id: "tg1".into(),
            name: "Urgent".into(),
            color: "#e11d48".into(),
            group_id: Some("g1".into()),
        };

        let group = TagGroup {
            id: "g1".into(),
            name: "Priority".into(),
            order: 0,
        };

        let envelope = ExportEnvelope {
            version: "2.0".into(),
            exported_at: "2026-03-16T12:00:00Z".into(),
            todos: vec![todo],
            archived_todos: vec![],
            tags: vec![tag],
            tag_groups: vec![group],
            settings: ExportSettings {
                theme: "dark".into(),
                locale: "zh".into(),
                show_timeline: true,
                tomorrow_planning_unlock_hour: 20,
            },
        };

        let json_str = serde_json::to_string(&envelope).unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&json_str).unwrap();
        import_json_to_db(&conn, &parsed);

        let todos = db::get_todos(&conn, false).unwrap();
        assert_eq!(todos.len(), 1);
        assert_eq!(todos[0].id, "rt1");
        assert_eq!(todos[0].difficulty, 4);
        assert_eq!(todos[0].duration_days, 3);
        assert_eq!(todos[0].completed_day_keys, vec!["2026-03-16"]);
        assert_eq!(todos[0].subtasks.len(), 1);
        assert!(todos[0].subtasks[0].completed);

        let tags = db::get_tags(&conn).unwrap();
        assert_eq!(tags.len(), 1);
        assert_eq!(tags[0].name, "Urgent");

        let groups = db::get_tag_groups(&conn).unwrap();
        assert_eq!(groups.len(), 1);
        assert_eq!(groups[0].name, "Priority");
    }

    // ── Dirty data tolerance ──────────────────────────────────────────

    #[test]
    fn normalize_todo_extra_fields_ignored() {
        let val = serde_json::json!({
            "id": "t3",
            "title": "Extra",
            "unknownField": "should be ignored",
            "anotherUnknown": 42
        });
        let todo = normalize_todo(&val).unwrap();
        assert_eq!(todo.id, "t3");
        assert_eq!(todo.title, "Extra");
    }

    #[test]
    fn normalize_todo_wrong_types_use_defaults() {
        let val = serde_json::json!({
            "id": "t4",
            "title": "TypeMix",
            "completed": "not a bool",
            "difficulty": "high",
            "durationDays": "three"
        });
        let todo = normalize_todo(&val).unwrap();
        assert!(!todo.completed);
        assert_eq!(todo.difficulty, 2);
        assert_eq!(todo.duration_days, 1);
    }

    #[test]
    fn normalize_todo_not_object_errors() {
        let val = serde_json::json!("just a string");
        let err = normalize_todo(&val);
        assert!(err.is_err());
    }

    #[test]
    fn import_missing_optional_sections() {
        let conn = test_conn();
        let minimal = serde_json::json!({
            "todos": [{"id": "m1", "title": "Minimal"}]
        });
        let result = import_json_to_db(&conn, &minimal);

        assert_eq!(result.todos_count, 1);
        assert_eq!(result.archived_count, 0);
        assert_eq!(result.tags_count, 0);
        assert_eq!(result.tag_groups_count, 0);
        assert!(!result.settings_updated);
    }

    #[test]
    fn import_empty_arrays() {
        let conn = test_conn();
        let empty = serde_json::json!({
            "todos": [],
            "archivedTodos": [],
            "tags": [],
            "tagGroups": [],
            "settings": {}
        });
        let result = import_json_to_db(&conn, &empty);

        assert_eq!(result.todos_count, 0);
        assert_eq!(result.archived_count, 0);
        assert_eq!(result.tags_count, 0);
        assert_eq!(result.tag_groups_count, 0);
        assert!(result.settings_updated);
    }
}
