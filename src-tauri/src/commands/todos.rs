use tauri::{AppHandle, State};

use crate::db::{self, DbState};
use crate::error::AppError;
use crate::models::{ensure_unique_ids, Todo};
use crate::reminders;

#[tauri::command]
pub fn get_todos(state: State<'_, DbState>, archived: bool) -> Result<Vec<Todo>, AppError> {
    let conn = state
        .0
        .lock()
        .map_err(|e| AppError::custom(e.to_string()))?;
    db::get_todos(&conn, archived)
}

#[tauri::command]
pub fn save_todo(
    app: AppHandle,
    state: State<'_, DbState>,
    todo: Todo,
    archived: bool,
) -> Result<(), AppError> {
    todo.validate()?;
    let conn = state
        .0
        .lock()
        .map_err(|e| AppError::custom(e.to_string()))?;
    db::save_todo(&conn, &todo, archived)?;
    drop(conn);
    reminders::reschedule_all(&app);
    Ok(())
}

#[tauri::command]
pub fn save_todos(
    app: AppHandle,
    state: State<'_, DbState>,
    todos: Vec<Todo>,
    archived: bool,
) -> Result<(), AppError> {
    ensure_unique_ids(todos.iter().map(|todo| todo.id.as_str()), "任务 ID")?;
    for todo in &todos {
        todo.validate()?;
    }
    let conn = state
        .0
        .lock()
        .map_err(|e| AppError::custom(e.to_string()))?;
    db::save_todos(&conn, &todos, archived)?;
    drop(conn);
    reminders::reschedule_all(&app);
    Ok(())
}

#[tauri::command]
pub fn delete_todo(app: AppHandle, state: State<'_, DbState>, id: String) -> Result<(), AppError> {
    ensure_unique_ids([id.as_str()], "任务 ID")?;
    let conn = state
        .0
        .lock()
        .map_err(|e| AppError::custom(e.to_string()))?;
    db::delete_todo(&conn, &id)?;
    drop(conn);
    reminders::reschedule_all(&app);
    Ok(())
}

#[tauri::command]
pub fn archive_todos(
    app: AppHandle,
    state: State<'_, DbState>,
    ids: Vec<String>,
) -> Result<(), AppError> {
    ensure_unique_ids(ids.iter().map(|id| id.as_str()), "任务 ID")?;
    let conn = state
        .0
        .lock()
        .map_err(|e| AppError::custom(e.to_string()))?;
    db::archive_todos(&conn, &ids)?;
    drop(conn);
    reminders::reschedule_all(&app);
    Ok(())
}
