pub mod autostart;
pub mod events;
pub mod export;
pub mod settings;
pub mod tags;
pub mod todos;

use tauri::State;

use crate::db::{self, DbState};
use crate::error::AppError;
use crate::predict::{self, PredictionResult};

#[tauri::command]
pub fn predict_completions(state: State<'_, DbState>) -> Result<Vec<PredictionResult>, AppError> {
    let conn = state
        .0
        .lock()
        .map_err(|e| AppError::custom(e.to_string()))?;
    let active = db::get_todos(&conn, false)?;
    let archived = db::get_todos(&conn, true)?;
    let settings = db::get_settings(&conn)?;
    let now_ms = chrono::Utc::now().timestamp_millis() as f64;
    let events = db::get_events_in_range(&conn, now_ms - 90.0 * 86_400_000.0, now_ms)?;
    let today = chrono::Local::now().format("%Y-%m-%d").to_string();
    Ok(predict::predict_all(
        &active, &archived, &events, &settings, &today,
    ))
}
