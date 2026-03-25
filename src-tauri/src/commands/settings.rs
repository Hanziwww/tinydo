use tauri::{AppHandle, State};

use crate::db::{self, DbState};
use crate::error::AppError;
use crate::models::{ensure_unique_ids, LegacyData, Settings};
use crate::reminders;
use crate::sync::engine::record_local_change;

fn validate_legacy_data(data: &LegacyData) -> Result<(), AppError> {
    ensure_unique_ids(data.todos.iter().map(|todo| todo.id.as_str()), "任务 ID")?;
    ensure_unique_ids(
        data.archived_todos.iter().map(|todo| todo.id.as_str()),
        "已归档任务 ID",
    )?;
    ensure_unique_ids(data.tags.iter().map(|tag| tag.id.as_str()), "标签 ID")?;
    ensure_unique_ids(
        data.tag_groups.iter().map(|group| group.id.as_str()),
        "标签组 ID",
    )?;

    let archived_ids = data
        .archived_todos
        .iter()
        .map(|todo| todo.id.as_str())
        .collect::<std::collections::HashSet<_>>();
    for todo in &data.todos {
        todo.validate()?;
        if archived_ids.contains(todo.id.as_str()) {
            return Err(AppError::custom("导入数据中存在重复的任务 ID"));
        }
    }
    for todo in &data.archived_todos {
        todo.validate()?;
    }
    for tag in &data.tags {
        tag.validate()?;
    }
    for group in &data.tag_groups {
        group.validate()?;
    }
    data.settings.validate()?;

    Ok(())
}

#[tauri::command]
pub fn get_all_settings(state: State<'_, DbState>) -> Result<Settings, AppError> {
    let conn = state
        .0
        .lock()
        .map_err(|e| AppError::custom(e.to_string()))?;
    db::get_settings(&conn)
}

#[tauri::command]
pub fn save_settings(state: State<'_, DbState>, settings: Settings) -> Result<(), AppError> {
    settings.validate()?;
    let conn = state
        .0
        .lock()
        .map_err(|e| AppError::custom(e.to_string()))?;
    db::save_settings(&conn, &settings)?;
    let data = serde_json::to_string(&settings).ok();
    let _ = record_local_change(&conn, "settings", "app_settings", "upsert", data.as_deref());
    Ok(())
}

#[tauri::command]
pub fn check_needs_migration(state: State<'_, DbState>) -> Result<bool, AppError> {
    let conn = state
        .0
        .lock()
        .map_err(|e| AppError::custom(e.to_string()))?;
    let migrated = db::get_meta(&conn, "migrated_from_legacy")?;
    if migrated.is_some() {
        return Ok(false);
    }
    let empty = db::is_db_empty(&conn)?;
    Ok(empty)
}

#[tauri::command]
pub fn migrate_from_legacy(
    app: AppHandle,
    state: State<'_, DbState>,
    data: LegacyData,
) -> Result<(), AppError> {
    validate_legacy_data(&data)?;
    let conn = state
        .0
        .lock()
        .map_err(|e| AppError::custom(e.to_string()))?;
    db::migrate_from_legacy(&conn, &data)?;
    drop(conn);
    reminders::schedule_reschedule(app);
    Ok(())
}
