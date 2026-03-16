use tauri::State;

use crate::db::{self, DbState};
use crate::error::AppError;
use crate::models::Todo;

#[tauri::command]
pub fn get_todos(state: State<'_, DbState>, archived: bool) -> Result<Vec<Todo>, AppError> {
    let conn = state
        .0
        .lock()
        .map_err(|e| AppError::custom(e.to_string()))?;
    db::get_todos(&conn, archived)
}

#[tauri::command]
pub fn save_todo(state: State<'_, DbState>, todo: Todo, archived: bool) -> Result<(), AppError> {
    let conn = state
        .0
        .lock()
        .map_err(|e| AppError::custom(e.to_string()))?;
    db::save_todo(&conn, &todo, archived)
}

#[tauri::command]
pub fn save_todos(
    state: State<'_, DbState>,
    todos: Vec<Todo>,
    archived: bool,
) -> Result<(), AppError> {
    let conn = state
        .0
        .lock()
        .map_err(|e| AppError::custom(e.to_string()))?;
    db::save_todos(&conn, &todos, archived)
}

#[tauri::command]
pub fn delete_todo(state: State<'_, DbState>, id: String) -> Result<(), AppError> {
    if id.is_empty() || id.len() > 64 {
        return Err(AppError::custom("Invalid todo id"));
    }
    let conn = state
        .0
        .lock()
        .map_err(|e| AppError::custom(e.to_string()))?;
    db::delete_todo(&conn, &id)
}

#[tauri::command]
pub fn archive_todos(state: State<'_, DbState>, ids: Vec<String>) -> Result<(), AppError> {
    let conn = state
        .0
        .lock()
        .map_err(|e| AppError::custom(e.to_string()))?;
    db::archive_todos(&conn, &ids)
}
