use tauri::State;

use crate::db::{self, DbState};
use crate::error::AppError;
use crate::models::{Tag, TagGroup};

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
    let conn = state
        .0
        .lock()
        .map_err(|e| AppError::custom(e.to_string()))?;
    db::save_tag(&conn, &tag)
}

#[tauri::command]
pub fn delete_tag(state: State<'_, DbState>, id: String) -> Result<(), AppError> {
    let conn = state
        .0
        .lock()
        .map_err(|e| AppError::custom(e.to_string()))?;
    db::delete_tag(&conn, &id)
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
    let conn = state
        .0
        .lock()
        .map_err(|e| AppError::custom(e.to_string()))?;
    db::save_tag_group(&conn, &group)
}

#[tauri::command]
pub fn delete_tag_group(state: State<'_, DbState>, id: String) -> Result<(), AppError> {
    let conn = state
        .0
        .lock()
        .map_err(|e| AppError::custom(e.to_string()))?;
    db::delete_tag_group(&conn, &id)
}
