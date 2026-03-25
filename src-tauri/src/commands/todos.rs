use tauri::{AppHandle, State};

use crate::db::{self, DbState};
use crate::error::AppError;
use crate::models::{ensure_unique_ids, Todo};
use crate::reminders;
use crate::sync::engine::record_local_change;

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
    let entity_type = if archived { "archived_todo" } else { "todo" };
    let data = serde_json::to_string(&todo).ok();
    let _ = record_local_change(&conn, entity_type, &todo.id, "upsert", data.as_deref());
    drop(conn);
    reminders::schedule_reschedule(app);
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
    let entity_type = if archived { "archived_todo" } else { "todo" };
    for todo in &todos {
        let data = serde_json::to_string(todo).ok();
        let _ = record_local_change(&conn, entity_type, &todo.id, "upsert", data.as_deref());
    }
    drop(conn);
    reminders::schedule_reschedule(app);
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
    let _ = record_local_change(&conn, "todo", &id, "delete", None);
    drop(conn);
    reminders::schedule_reschedule(app);
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
    for id in &ids {
        let todo_data: Option<String> = conn
            .query_row(
                "SELECT data FROM todos WHERE id = ?1",
                rusqlite::params![id],
                |row| row.get(0),
            )
            .ok();
        let _ = record_local_change(&conn, "archived_todo", id, "upsert", todo_data.as_deref());
    }
    drop(conn);
    reminders::schedule_reschedule(app);
    Ok(())
}
