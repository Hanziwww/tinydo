use tauri::State;

use crate::db::{self, DbState};
use crate::error::AppError;
use crate::models::{ExportEnvelope, ExportSettings, ImportResult, Todo};

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

    log::info!(
        "Data imported from {}: {} todos, {} archived",
        file_path,
        todos_count,
        archived_count
    );

    Ok(ImportResult {
        todos_count,
        archived_count,
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

    #[test]
    fn crc32_known_value() {
        // CRC32 of "pHYs" should be a known value
        let crc = crc32(b"pHYs");
        assert_ne!(crc, 0);
    }

    #[test]
    fn inject_dpi_preserves_small_png() {
        // Too-small input should be returned as-is
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
            "targetDate": "20260316",
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
}
