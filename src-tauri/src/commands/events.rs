use tauri::State;

use crate::db::{self, DbState};
use crate::error::AppError;
use crate::models::TinyEvent;
use crate::sync::engine::record_local_change;

#[tauri::command]
pub fn save_events(state: State<'_, DbState>, events: Vec<TinyEvent>) -> Result<(), AppError> {
    for event in &events {
        event.validate()?;
    }
    let conn = state
        .0
        .lock()
        .map_err(|e| AppError::custom(e.to_string()))?;
    db::save_events(&conn, &events)?;
    for event in &events {
        let data = serde_json::to_string(event).ok();
        let _ = record_local_change(&conn, "event", &event.id, "upsert", data.as_deref());
    }
    Ok(())
}

#[tauri::command]
pub fn get_events_for_todo(
    state: State<'_, DbState>,
    todo_id: String,
) -> Result<Vec<TinyEvent>, AppError> {
    let conn = state
        .0
        .lock()
        .map_err(|e| AppError::custom(e.to_string()))?;
    db::get_events_for_todo(&conn, &todo_id)
}

#[tauri::command]
pub fn get_events_for_date(
    state: State<'_, DbState>,
    day_start_ms: f64,
    day_end_ms: f64,
) -> Result<Vec<TinyEvent>, AppError> {
    let conn = state
        .0
        .lock()
        .map_err(|e| AppError::custom(e.to_string()))?;
    db::get_events_for_date(&conn, day_start_ms, day_end_ms)
}

#[tauri::command]
pub fn get_events_in_range(
    state: State<'_, DbState>,
    from_ms: f64,
    to_ms: f64,
) -> Result<Vec<TinyEvent>, AppError> {
    let conn = state
        .0
        .lock()
        .map_err(|e| AppError::custom(e.to_string()))?;
    db::get_events_in_range(&conn, from_ms, to_ms)
}
