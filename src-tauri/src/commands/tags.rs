use tauri::State;

use crate::db::{self, DbState};
use crate::error::AppError;
use crate::models::{ensure_unique_ids, Tag, TagGroup};
use crate::sync::engine::record_local_change;

#[tauri::command]
pub fn get_tags(state: State<'_, DbState>) -> Result<Vec<Tag>, AppError> {
    let conn = state
        .0
        .lock()
        .map_err(|e| AppError::custom(e.to_string()))?;
    db::get_tags(&conn)
}

#[tauri::command]
pub fn save_tag(state: State<'_, DbState>, tag: Tag) -> Result<(), AppError> {
    tag.validate()?;
    let conn = state
        .0
        .lock()
        .map_err(|e| AppError::custom(e.to_string()))?;
    db::save_tag(&conn, &tag)?;
    let data = serde_json::to_string(&tag).ok();
    let _ = record_local_change(&conn, "tag", &tag.id, "upsert", data.as_deref());
    Ok(())
}

#[tauri::command]
pub fn delete_tag(state: State<'_, DbState>, id: String) -> Result<(), AppError> {
    ensure_unique_ids([id.as_str()], "标签 ID")?;
    let conn = state
        .0
        .lock()
        .map_err(|e| AppError::custom(e.to_string()))?;
    db::delete_tag(&conn, &id)?;
    let _ = record_local_change(&conn, "tag", &id, "delete", None);
    Ok(())
}

#[tauri::command]
pub fn get_tag_groups(state: State<'_, DbState>) -> Result<Vec<TagGroup>, AppError> {
    let conn = state
        .0
        .lock()
        .map_err(|e| AppError::custom(e.to_string()))?;
    db::get_tag_groups(&conn)
}

#[tauri::command]
pub fn save_tag_group(state: State<'_, DbState>, group: TagGroup) -> Result<(), AppError> {
    group.validate()?;
    let conn = state
        .0
        .lock()
        .map_err(|e| AppError::custom(e.to_string()))?;
    db::save_tag_group(&conn, &group)?;
    let data = serde_json::to_string(&group).ok();
    let _ = record_local_change(&conn, "tag_group", &group.id, "upsert", data.as_deref());
    Ok(())
}

#[tauri::command]
pub fn delete_tag_group(state: State<'_, DbState>, id: String) -> Result<(), AppError> {
    ensure_unique_ids([id.as_str()], "标签组 ID")?;
    let conn = state
        .0
        .lock()
        .map_err(|e| AppError::custom(e.to_string()))?;
    db::delete_tag_group(&conn, &id)?;
    let _ = record_local_change(&conn, "tag_group", &id, "delete", None);
    Ok(())
}
