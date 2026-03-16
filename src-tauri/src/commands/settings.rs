use tauri::State;

use crate::db::{self, DbState};
use crate::error::AppError;
use crate::models::{LegacyData, Settings};

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
    let conn = state
        .0
        .lock()
        .map_err(|e| AppError::custom(e.to_string()))?;
    db::save_settings(&conn, &settings)
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
pub fn migrate_from_legacy(state: State<'_, DbState>, data: LegacyData) -> Result<(), AppError> {
    let conn = state
        .0
        .lock()
        .map_err(|e| AppError::custom(e.to_string()))?;
    db::migrate_from_legacy(&conn, &data)
}
