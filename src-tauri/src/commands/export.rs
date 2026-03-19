use serde::{de::DeserializeOwned, Deserialize};
use tauri::{AppHandle, State};

use crate::db::{self, DbState};
use crate::error::AppError;
use crate::models::{
    ensure_unique_ids, ExportEnvelope, ImportResult, Settings, SubTask, Tag, TagGroup,
    TaskRelation, TimeSlot, TinyEvent, Todo, TodoHistoryKind, WindowPos, WindowRect,
};
use crate::reminders;

#[tauri::command]
pub fn export_data(state: State<'_, DbState>, file_path: String) -> Result<(), AppError> {
    if file_path.is_empty() {
        return Err(AppError::custom("File path is empty"));
    }

    let conn = state
        .0
        .lock()
        .map_err(|e| AppError::custom(e.to_string()))?;

    let envelope = build_export_envelope(&conn)?;
    let json = serde_json::to_string_pretty(&envelope)?;
    std::fs::write(&file_path, json)?;
    log::info!("Data exported to {}", file_path);
    Ok(())
}

pub(crate) fn build_export_envelope(
    conn: &rusqlite::Connection,
) -> Result<ExportEnvelope, AppError> {
    let todos = db::get_todos(conn, false)?;
    let archived_todos = db::get_todos(conn, true)?;
    let tags = db::get_tags(conn)?;
    let tag_groups = db::get_tag_groups(conn)?;
    let settings = db::get_settings(conn)?;
    let events = db::get_all_events(conn)?;

    let envelope = ExportEnvelope {
        version: "3.0".into(),
        exported_at: chrono::Utc::now().to_rfc3339(),
        todos,
        archived_todos,
        tags,
        tag_groups,
        settings,
        events,
    };
    Ok(envelope)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ImportedSubTask {
    id: String,
    title: String,
    #[serde(default)]
    completed: bool,
    #[serde(default)]
    order: i64,
}

impl From<ImportedSubTask> for SubTask {
    fn from(value: ImportedSubTask) -> Self {
        Self {
            id: value.id,
            title: value.title,
            completed: value.completed,
            order: value.order,
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ImportedTimeSlot {
    id: String,
    start: String,
    #[serde(default)]
    end: Option<String>,
}

impl From<ImportedTimeSlot> for TimeSlot {
    fn from(value: ImportedTimeSlot) -> Self {
        Self {
            id: value.id,
            start: value.start,
            end: value.end,
        }
    }
}

fn default_difficulty() -> u8 {
    2
}

fn default_duration_days() -> u32 {
    1
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ImportedTodo {
    id: String,
    title: String,
    #[serde(default)]
    completed: bool,
    #[serde(default)]
    tag_ids: Vec<String>,
    #[serde(default = "default_difficulty")]
    difficulty: u8,
    #[serde(default)]
    time_slots: Vec<ImportedTimeSlot>,
    #[serde(default)]
    reminder_mins_before: Option<i32>,
    target_date: String,
    #[serde(default)]
    order: f64,
    #[serde(default)]
    created_at: f64,
    #[serde(default)]
    subtasks: Vec<ImportedSubTask>,
    #[serde(default = "default_duration_days")]
    duration_days: u32,
    #[serde(default)]
    completed_day_keys: Vec<String>,
    #[serde(default)]
    archived_day_keys: Vec<String>,
    #[serde(default)]
    outgoing_relations: Vec<TaskRelation>,
    #[serde(default)]
    history_date: Option<String>,
    #[serde(default)]
    history_source_todo_id: Option<String>,
    #[serde(default)]
    history_kind: Option<TodoHistoryKind>,
}

#[derive(Debug, Default)]
struct ImportSettingsPatch {
    theme: Option<String>,
    locale: Option<String>,
    show_timeline: Option<bool>,
    tomorrow_planning_unlock_hour: Option<u32>,
    timeline_start_hour: Option<u32>,
    timeline_end_hour: Option<u32>,
    user_name: Option<String>,
    mini_always_on_top: Option<bool>,
    mini_fade_on_blur: Option<bool>,
    mini_fade_opacity: Option<f64>,
    enable_subtasks: Option<bool>,
    max_duration_days: Option<u32>,
    full_mode_rect: Option<Option<WindowRect>>,
    mini_mode_position: Option<Option<WindowPos>>,
    event_debounce_seconds: Option<u32>,
}

impl ImportSettingsPatch {
    fn is_empty(&self) -> bool {
        self.theme.is_none()
            && self.locale.is_none()
            && self.show_timeline.is_none()
            && self.tomorrow_planning_unlock_hour.is_none()
            && self.timeline_start_hour.is_none()
            && self.timeline_end_hour.is_none()
            && self.user_name.is_none()
            && self.mini_always_on_top.is_none()
            && self.mini_fade_on_blur.is_none()
            && self.mini_fade_opacity.is_none()
            && self.enable_subtasks.is_none()
            && self.max_duration_days.is_none()
            && self.full_mode_rect.is_none()
            && self.mini_mode_position.is_none()
            && self.event_debounce_seconds.is_none()
    }
}

#[derive(Debug)]
struct ParsedImportPayload {
    todos: Vec<Todo>,
    archived_todos: Vec<Todo>,
    tags: Vec<Tag>,
    tag_groups: Vec<TagGroup>,
    settings_patch: ImportSettingsPatch,
    events: Vec<TinyEvent>,
}

fn get_optional_array_field<'a>(
    obj: &'a serde_json::Map<String, serde_json::Value>,
    key: &str,
    label: &str,
) -> Result<Option<&'a Vec<serde_json::Value>>, AppError> {
    match obj.get(key) {
        Some(value) => value
            .as_array()
            .ok_or_else(|| AppError::custom(format!("{label}必须是数组")))
            .map(Some),
        None => Ok(None),
    }
}

fn parse_optional_string_field(
    obj: &serde_json::Map<String, serde_json::Value>,
    key: &str,
    label: &str,
) -> Result<Option<String>, AppError> {
    match obj.get(key) {
        Some(value) => value
            .as_str()
            .map(|v| Some(v.to_string()))
            .ok_or_else(|| AppError::custom(format!("{label}格式无效"))),
        None => Ok(None),
    }
}

fn parse_optional_bool_field(
    obj: &serde_json::Map<String, serde_json::Value>,
    key: &str,
    label: &str,
) -> Result<Option<bool>, AppError> {
    match obj.get(key) {
        Some(value) => value
            .as_bool()
            .map(Some)
            .ok_or_else(|| AppError::custom(format!("{label}格式无效"))),
        None => Ok(None),
    }
}

fn parse_optional_u32_field(
    obj: &serde_json::Map<String, serde_json::Value>,
    key: &str,
    label: &str,
) -> Result<Option<u32>, AppError> {
    match obj.get(key) {
        Some(value) => {
            let raw = value
                .as_u64()
                .ok_or_else(|| AppError::custom(format!("{label}格式无效")))?;
            let converted =
                u32::try_from(raw).map_err(|_| AppError::custom(format!("{label}超出范围")))?;
            Ok(Some(converted))
        }
        None => Ok(None),
    }
}

fn parse_optional_f64_field(
    obj: &serde_json::Map<String, serde_json::Value>,
    key: &str,
    label: &str,
) -> Result<Option<f64>, AppError> {
    match obj.get(key) {
        Some(value) => value
            .as_f64()
            .map(Some)
            .ok_or_else(|| AppError::custom(format!("{label}格式无效"))),
        None => Ok(None),
    }
}

fn parse_optional_nullable_field<T: DeserializeOwned>(
    obj: &serde_json::Map<String, serde_json::Value>,
    key: &str,
    label: &str,
) -> Result<Option<Option<T>>, AppError> {
    match obj.get(key) {
        Some(value) if value.is_null() => Ok(Some(None)),
        Some(value) => serde_json::from_value::<T>(value.clone())
            .map(|parsed| Some(Some(parsed)))
            .map_err(|_| AppError::custom(format!("{label}格式无效"))),
        None => Ok(None),
    }
}

fn parse_settings_patch(
    obj: &serde_json::Map<String, serde_json::Value>,
) -> Result<ImportSettingsPatch, AppError> {
    Ok(ImportSettingsPatch {
        theme: parse_optional_string_field(obj, "theme", "导入主题")?,
        locale: parse_optional_string_field(obj, "locale", "导入语言")?,
        show_timeline: parse_optional_bool_field(obj, "showTimeline", "导入 showTimeline")?,
        tomorrow_planning_unlock_hour: parse_optional_u32_field(
            obj,
            "tomorrowPlanningUnlockHour",
            "导入 tomorrowPlanningUnlockHour",
        )?,
        timeline_start_hour: parse_optional_u32_field(
            obj,
            "timelineStartHour",
            "导入 timelineStartHour",
        )?,
        timeline_end_hour: parse_optional_u32_field(
            obj,
            "timelineEndHour",
            "导入 timelineEndHour",
        )?,
        user_name: parse_optional_string_field(obj, "userName", "导入 userName")?,
        mini_always_on_top: parse_optional_bool_field(
            obj,
            "miniAlwaysOnTop",
            "导入 miniAlwaysOnTop",
        )?,
        mini_fade_on_blur: parse_optional_bool_field(obj, "miniFadeOnBlur", "导入 miniFadeOnBlur")?,
        mini_fade_opacity: parse_optional_f64_field(
            obj,
            "miniFadeOpacity",
            "导入 miniFadeOpacity",
        )?,
        enable_subtasks: parse_optional_bool_field(obj, "enableSubtasks", "导入 enableSubtasks")?,
        max_duration_days: parse_optional_u32_field(
            obj,
            "maxDurationDays",
            "导入 maxDurationDays",
        )?,
        full_mode_rect: parse_optional_nullable_field(obj, "fullModeRect", "导入 fullModeRect")?,
        mini_mode_position: parse_optional_nullable_field(
            obj,
            "miniModePosition",
            "导入 miniModePosition",
        )?,
        event_debounce_seconds: parse_optional_u32_field(
            obj,
            "eventDebounceSeconds",
            "导入 eventDebounceSeconds",
        )?,
    })
}

fn normalize_todo(raw: &serde_json::Value) -> Result<Todo, AppError> {
    let imported: ImportedTodo = serde_json::from_value(raw.clone())?;
    let todo = Todo {
        id: imported.id,
        title: imported.title,
        completed: imported.completed,
        tag_ids: imported.tag_ids,
        difficulty: imported.difficulty,
        time_slots: imported.time_slots.into_iter().map(Into::into).collect(),
        reminder_mins_before: imported.reminder_mins_before,
        target_date: imported.target_date,
        order: imported.order,
        created_at: imported.created_at,
        subtasks: imported.subtasks.into_iter().map(Into::into).collect(),
        duration_days: imported.duration_days,
        completed_day_keys: imported.completed_day_keys,
        archived_day_keys: imported.archived_day_keys,
        outgoing_relations: imported.outgoing_relations,
        history_date: imported.history_date,
        history_source_todo_id: imported.history_source_todo_id,
        history_kind: imported.history_kind,
    };
    todo.validate()?;
    Ok(todo)
}

fn validate_import_payload(
    todos: &[Todo],
    archived_todos: &[Todo],
    tags: &[Tag],
    tag_groups: &[TagGroup],
) -> Result<(), AppError> {
    ensure_unique_ids(todos.iter().map(|todo| todo.id.as_str()), "任务 ID")?;
    ensure_unique_ids(
        archived_todos.iter().map(|todo| todo.id.as_str()),
        "已归档任务 ID",
    )?;
    ensure_unique_ids(tags.iter().map(|tag| tag.id.as_str()), "标签 ID")?;
    ensure_unique_ids(
        tag_groups.iter().map(|group| group.id.as_str()),
        "标签组 ID",
    )?;

    let archived_ids = archived_todos
        .iter()
        .map(|todo| todo.id.as_str())
        .collect::<std::collections::HashSet<_>>();
    for todo in todos {
        if archived_ids.contains(todo.id.as_str()) {
            return Err(AppError::custom("导入数据中存在重复的任务 ID"));
        }
    }

    let group_ids = tag_groups
        .iter()
        .map(|group| group.id.as_str())
        .collect::<std::collections::HashSet<_>>();
    for tag in tags {
        if let Some(group_id) = &tag.group_id {
            if !group_ids.contains(group_id.as_str()) {
                return Err(AppError::custom(format!(
                    "标签 {} 引用了不存在的标签组 {}",
                    tag.id, group_id
                )));
            }
        }
    }

    let todo_ids = todos
        .iter()
        .map(|todo| todo.id.as_str())
        .chain(archived_todos.iter().map(|todo| todo.id.as_str()))
        .collect::<std::collections::HashSet<_>>();
    for todo in todos.iter().chain(archived_todos.iter()) {
        for relation in &todo.outgoing_relations {
            if !todo_ids.contains(relation.target_task_id.as_str()) {
                return Err(AppError::custom(format!(
                    "任务 {} 引用了不存在的目标任务 {}",
                    todo.id, relation.target_task_id
                )));
            }
        }
    }

    Ok(())
}

fn parse_import_payload(data: &serde_json::Value) -> Result<ParsedImportPayload, AppError> {
    let obj = data
        .as_object()
        .ok_or_else(|| AppError::custom("导入文件不是有效的 JSON 对象"))?;

    let version = obj
        .get("version")
        .and_then(|value| value.as_str())
        .ok_or_else(|| AppError::custom("导入文件缺少 version"))?;
    if version != "2.0" && version != "3.0" {
        return Err(AppError::custom(format!("暂不支持导入版本 {version}")));
    }

    let todos_arr = obj
        .get("todos")
        .and_then(|value| value.as_array())
        .ok_or_else(|| AppError::custom("导入文件缺少 todos 数组"))?;

    let archived_arr = get_optional_array_field(obj, "archivedTodos", "archivedTodos")?;
    let tags_arr = get_optional_array_field(obj, "tags", "tags")?;
    let groups_arr = get_optional_array_field(obj, "tagGroups", "tagGroups")?;
    let settings_patch = match obj.get("settings") {
        Some(value) => parse_settings_patch(
            value
                .as_object()
                .ok_or_else(|| AppError::custom("settings 必须是对象"))?,
        )?,
        None => ImportSettingsPatch::default(),
    };

    let todos = todos_arr
        .iter()
        .map(normalize_todo)
        .collect::<Result<Vec<_>, _>>()?;
    let archived_todos = match archived_arr {
        Some(arr) => arr
            .iter()
            .map(normalize_todo)
            .collect::<Result<Vec<_>, _>>()?,
        None => Vec::new(),
    };
    let tags = match tags_arr {
        Some(arr) => arr
            .iter()
            .map(|raw_tag| {
                let tag: Tag = serde_json::from_value(raw_tag.clone())?;
                tag.validate()?;
                Ok(tag)
            })
            .collect::<Result<Vec<_>, AppError>>()?,
        None => Vec::new(),
    };
    let tag_groups = match groups_arr {
        Some(arr) => arr
            .iter()
            .map(|raw_group| {
                let group: TagGroup = serde_json::from_value(raw_group.clone())?;
                group.validate()?;
                Ok(group)
            })
            .collect::<Result<Vec<_>, AppError>>()?,
        None => Vec::new(),
    };

    validate_import_payload(&todos, &archived_todos, &tags, &tag_groups)?;

    let events = match get_optional_array_field(obj, "events", "events")? {
        Some(arr) => arr
            .iter()
            .map(|raw| {
                let event: TinyEvent = serde_json::from_value(raw.clone())?;
                event.validate()?;
                Ok(event)
            })
            .collect::<Result<Vec<_>, AppError>>()?,
        None => Vec::new(),
    };

    Ok(ParsedImportPayload {
        todos,
        archived_todos,
        tags,
        tag_groups,
        settings_patch,
        events,
    })
}

fn merge_settings_patch(
    conn: &rusqlite::Connection,
    patch: &ImportSettingsPatch,
) -> Result<Option<Settings>, AppError> {
    if patch.is_empty() {
        return Ok(None);
    }

    let mut settings = db::get_settings(conn)?;
    if let Some(theme) = &patch.theme {
        settings.theme = theme.clone();
    }
    if let Some(locale) = &patch.locale {
        settings.locale = locale.clone();
    }
    if let Some(show_timeline) = patch.show_timeline {
        settings.show_timeline = show_timeline;
    }
    if let Some(hour) = patch.tomorrow_planning_unlock_hour {
        settings.tomorrow_planning_unlock_hour = hour;
    }
    if let Some(start_hour) = patch.timeline_start_hour {
        settings.timeline_start_hour = start_hour;
    }
    if let Some(end_hour) = patch.timeline_end_hour {
        settings.timeline_end_hour = end_hour;
    }
    if let Some(user_name) = &patch.user_name {
        settings.user_name = user_name.clone();
    }
    if let Some(mini_always_on_top) = patch.mini_always_on_top {
        settings.mini_always_on_top = mini_always_on_top;
    }
    if let Some(mini_fade_on_blur) = patch.mini_fade_on_blur {
        settings.mini_fade_on_blur = mini_fade_on_blur;
    }
    if let Some(mini_fade_opacity) = patch.mini_fade_opacity {
        settings.mini_fade_opacity = mini_fade_opacity;
    }
    if let Some(enable_subtasks) = patch.enable_subtasks {
        settings.enable_subtasks = enable_subtasks;
    }
    if let Some(max_duration_days) = patch.max_duration_days {
        settings.max_duration_days = max_duration_days;
    }
    if let Some(full_mode_rect) = &patch.full_mode_rect {
        settings.full_mode_rect = full_mode_rect.clone();
    }
    if let Some(mini_mode_position) = &patch.mini_mode_position {
        settings.mini_mode_position = mini_mode_position.clone();
    }
    if let Some(event_debounce_seconds) = patch.event_debounce_seconds {
        settings.event_debounce_seconds = event_debounce_seconds;
    }
    settings.validate()?;

    Ok(Some(settings))
}

pub(crate) fn import_json_to_db(
    conn: &rusqlite::Connection,
    json: &serde_json::Value,
) -> Result<ImportResult, AppError> {
    let parsed = parse_import_payload(json)?;
    let merged_settings = merge_settings_patch(conn, &parsed.settings_patch)?;

    db::replace_import_data(
        conn,
        &parsed.todos,
        &parsed.archived_todos,
        &parsed.tags,
        &parsed.tag_groups,
        merged_settings.as_ref(),
    )?;

    db::clear_events(conn)?;
    if !parsed.events.is_empty() {
        db::save_events(conn, &parsed.events)?;
    }

    Ok(ImportResult {
        todos_count: parsed.todos.len(),
        archived_count: parsed.archived_todos.len(),
        tags_count: parsed.tags.len(),
        tag_groups_count: parsed.tag_groups.len(),
        settings_updated: merged_settings.is_some(),
    })
}

fn into_import_failure(err: AppError) -> AppError {
    AppError::custom(format!("导入失败：{}。未写入任何变更", err.user_message()))
}

#[tauri::command]
pub fn import_data(
    app: AppHandle,
    state: State<'_, DbState>,
    file_path: String,
) -> Result<ImportResult, AppError> {
    if file_path.trim().is_empty() {
        return Err(AppError::custom(
            "导入失败：文件路径不能为空。未写入任何变更",
        ));
    }

    let raw =
        std::fs::read_to_string(&file_path).map_err(|error| into_import_failure(error.into()))?;
    let data: serde_json::Value =
        serde_json::from_str(&raw).map_err(|error| into_import_failure(error.into()))?;

    let conn = state
        .0
        .lock()
        .map_err(|e| AppError::custom(e.to_string()))?;
    let result = import_json_to_db(&conn, &data).map_err(into_import_failure)?;
    drop(conn);
    reminders::reschedule_all(&app);

    log::info!(
        "Data imported from {}: {} todos, {} archived, {} tags, {} tag groups, settings={}",
        file_path,
        result.todos_count,
        result.archived_count,
        result.tags_count,
        result.tag_groups_count,
        result.settings_updated
    );

    Ok(result)
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
    use crate::models::{EventType, ExportEnvelope, Settings, TinyEvent};
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
            CREATE TABLE events (id TEXT PRIMARY KEY, todo_id TEXT NOT NULL, event_type TEXT NOT NULL, field TEXT, old_value TEXT, new_value TEXT, timestamp REAL NOT NULL);
            CREATE INDEX idx_events_todo ON events(todo_id);
            CREATE INDEX idx_events_ts ON events(timestamp);
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
                "tomorrowPlanningUnlockHour": 18,
                "timelineStartHour": 8,
                "timelineEndHour": 22,
                "userName": "Han",
                "miniAlwaysOnTop": false,
                "miniFadeOnBlur": false,
                "miniFadeOpacity": 0.6,
                "enableSubtasks": false,
                "maxDurationDays": 14,
                "fullModeRect": {"w": 1080.0, "h": 780.0, "x": 120.0, "y": 80.0},
                "miniModePosition": {"x": 300.0, "y": 160.0}
            }
        })
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
            "title": "Sparse",
            "targetDate": "2026-03-16"
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
        let result = import_json_to_db(&conn, &envelope).unwrap();

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
        let result = import_json_to_db(&conn, &envelope).unwrap();

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
        let result = import_json_to_db(&conn, &envelope).unwrap();

        assert!(result.settings_updated);

        let settings = db::get_settings(&conn).unwrap();
        assert_eq!(settings.theme, "light");
        assert_eq!(settings.locale, "en");
        assert!(!settings.show_timeline);
        assert_eq!(settings.tomorrow_planning_unlock_hour, 18);
        assert_eq!(settings.timeline_start_hour, 8);
        assert_eq!(settings.timeline_end_hour, 22);
        assert_eq!(settings.user_name, "Han");
        assert!(!settings.mini_always_on_top);
        assert!(!settings.mini_fade_on_blur);
        assert_eq!(settings.mini_fade_opacity, 0.6);
        assert!(!settings.enable_subtasks);
        assert_eq!(settings.max_duration_days, 14);
        assert_eq!(settings.full_mode_rect.as_ref().unwrap().w, 1080.0);
        assert_eq!(settings.mini_mode_position.as_ref().unwrap().x, 300.0);
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
            archived_day_keys: vec![],
            outgoing_relations: vec![],
            history_date: None,
            history_source_todo_id: None,
            history_kind: None,
        };
        db::save_todo(&conn, &old_todo, false).unwrap();

        assert_eq!(db::get_tags(&conn).unwrap().len(), 1);
        assert_eq!(db::get_todos(&conn, false).unwrap().len(), 1);

        // Import replaces everything
        let envelope = sample_envelope();
        import_json_to_db(&conn, &envelope).unwrap();

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
            archived_day_keys: vec![],
            outgoing_relations: vec![],
            history_date: None,
            history_source_todo_id: None,
            history_kind: None,
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
            version: "3.0".into(),
            exported_at: "2026-03-16T12:00:00Z".into(),
            todos: vec![todo],
            archived_todos: vec![],
            tags: vec![tag],
            tag_groups: vec![group],
            settings: Settings {
                theme: "dark".into(),
                locale: "zh".into(),
                show_timeline: true,
                tomorrow_planning_unlock_hour: 20,
                ..Settings::default()
            },
            events: vec![],
        };

        let json_str = serde_json::to_string(&envelope).unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&json_str).unwrap();
        import_json_to_db(&conn, &parsed).unwrap();

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

    #[test]
    fn import_export_roundtrip_preserves_events() {
        let conn = test_conn();

        let todo = Todo {
            id: "evt-todo".into(),
            title: "Eventful".into(),
            completed: false,
            tag_ids: vec!["tg1".into()],
            difficulty: 3,
            time_slots: vec![],
            reminder_mins_before: Some(15),
            target_date: "2026-03-19".into(),
            order: 1.0,
            created_at: 1710000000000.0,
            subtasks: vec![],
            duration_days: 1,
            completed_day_keys: vec![],
            archived_day_keys: vec![],
            outgoing_relations: vec![],
            history_date: None,
            history_source_todo_id: None,
            history_kind: None,
        };

        let envelope = ExportEnvelope {
            version: "3.0".into(),
            exported_at: "2026-03-19T09:20:00Z".into(),
            todos: vec![todo],
            archived_todos: vec![],
            tags: vec![Tag {
                id: "tg1".into(),
                name: "Work".into(),
                color: "#6366f1".into(),
                group_id: None,
            }],
            tag_groups: vec![],
            settings: Settings::default(),
            events: vec![
                TinyEvent {
                    id: "evt-1".into(),
                    todo_id: "evt-todo".into(),
                    event_type: EventType::Created,
                    field: None,
                    old_value: None,
                    new_value: Some(serde_json::json!({
                        "title": "Eventful",
                        "difficulty": 3
                    })),
                    timestamp: 1710000000000.0,
                },
                TinyEvent {
                    id: "evt-2".into(),
                    todo_id: "evt-todo".into(),
                    event_type: EventType::DifficultyChanged,
                    field: Some("difficulty".into()),
                    old_value: Some(serde_json::json!(3)),
                    new_value: Some(serde_json::json!(4)),
                    timestamp: 1710000005000.0,
                },
            ],
        };

        let json_str = serde_json::to_string(&envelope).unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&json_str).unwrap();
        import_json_to_db(&conn, &parsed).unwrap();

        let events = db::get_all_events(&conn).unwrap();
        assert_eq!(events.len(), 2);

        let created = events.iter().find(|event| event.id == "evt-1").unwrap();
        assert_eq!(created.todo_id, "evt-todo");
        assert_eq!(created.event_type, EventType::Created);
        assert_eq!(
            created.new_value,
            Some(serde_json::json!({
                "title": "Eventful",
                "difficulty": 3
            }))
        );

        let difficulty_changed = events.iter().find(|event| event.id == "evt-2").unwrap();
        assert_eq!(difficulty_changed.event_type, EventType::DifficultyChanged);
        assert_eq!(difficulty_changed.field.as_deref(), Some("difficulty"));
        assert_eq!(difficulty_changed.old_value, Some(serde_json::json!(3)));
        assert_eq!(difficulty_changed.new_value, Some(serde_json::json!(4)));
        assert!(difficulty_changed.timestamp > created.timestamp);
    }

    // ── Dirty data tolerance ──────────────────────────────────────────

    #[test]
    fn normalize_todo_extra_fields_ignored() {
        let val = serde_json::json!({
            "id": "t3",
            "title": "Extra",
            "targetDate": "2026-03-16",
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
            "targetDate": "2026-03-16",
            "completed": "not a bool",
            "difficulty": "high",
            "durationDays": "three"
        });
        assert!(normalize_todo(&val).is_err());
    }

    #[test]
    fn normalize_todo_not_object_errors() {
        let val = serde_json::json!("just a string");
        let err = normalize_todo(&val);
        assert!(err.is_err());
    }

    #[test]
    fn normalize_todo_requires_target_date() {
        let val = serde_json::json!({
            "id": "t5",
            "title": "Missing date"
        });
        assert!(normalize_todo(&val).is_err());
    }

    #[test]
    fn import_missing_optional_sections() {
        let conn = test_conn();
        let minimal = serde_json::json!({
            "version": "2.0",
            "todos": [{"id": "m1", "title": "Minimal", "targetDate": "2026-03-16"}]
        });
        let result = import_json_to_db(&conn, &minimal).unwrap();

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
            "version": "2.0",
            "todos": [],
            "archivedTodos": [],
            "tags": [],
            "tagGroups": [],
            "settings": {}
        });
        let result = import_json_to_db(&conn, &empty).unwrap();

        assert_eq!(result.todos_count, 0);
        assert_eq!(result.archived_count, 0);
        assert_eq!(result.tags_count, 0);
        assert_eq!(result.tag_groups_count, 0);
        assert!(!result.settings_updated);
    }

    #[test]
    fn import_rejects_duplicate_todo_ids() {
        let conn = test_conn();
        let envelope = serde_json::json!({
            "version": "2.0",
            "todos": [
                {"id": "dup", "title": "A", "targetDate": "2026-03-16"},
                {"id": "dup", "title": "B", "targetDate": "2026-03-16"}
            ]
        });
        assert!(import_json_to_db(&conn, &envelope).is_err());
    }

    #[test]
    fn import_rejects_missing_tag_group_reference() {
        let conn = test_conn();
        let envelope = serde_json::json!({
            "version": "2.0",
            "todos": [],
            "tags": [
                {"id": "tag1", "name": "Work", "color": "#ff0000", "groupId": "missing"}
            ],
            "tagGroups": []
        });
        assert!(import_json_to_db(&conn, &envelope).is_err());
    }

    #[test]
    fn import_rejects_missing_relation_target() {
        let conn = test_conn();
        let envelope = serde_json::json!({
            "version": "2.0",
            "todos": [
                {
                    "id": "task-1",
                    "title": "Has relation",
                    "targetDate": "2026-03-16",
                    "outgoingRelations": [
                        {
                            "id": "rel-1",
                            "targetTaskId": "missing-task",
                            "relationType": "dependsOn"
                        }
                    ]
                }
            ]
        });
        assert!(import_json_to_db(&conn, &envelope).is_err());
    }

    #[test]
    fn import_validation_failure_keeps_old_data() {
        let conn = test_conn();
        db::save_todo(
            &conn,
            &Todo {
                id: "old".into(),
                title: "Keep me".into(),
                completed: false,
                tag_ids: vec![],
                difficulty: 2,
                time_slots: vec![],
                reminder_mins_before: None,
                target_date: "2026-03-16".into(),
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
            },
            false,
        )
        .unwrap();

        let envelope = serde_json::json!({
            "version": "2.0",
            "todos": [{"id": "", "title": "Broken", "targetDate": "2026-03-16"}]
        });
        assert!(import_json_to_db(&conn, &envelope).is_err());

        let todos = db::get_todos(&conn, false).unwrap();
        assert_eq!(todos.len(), 1);
        assert_eq!(todos[0].id, "old");
    }

    #[test]
    fn import_requires_supported_version() {
        let conn = test_conn();
        let envelope = serde_json::json!({
            "version": "1.0",
            "todos": []
        });
        assert!(import_json_to_db(&conn, &envelope).is_err());
    }
}
