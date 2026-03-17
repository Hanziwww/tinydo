use std::collections::HashMap;
use std::sync::Mutex;

use chrono::Timelike;
use tauri::{AppHandle, Manager};
use tokio::task::JoinHandle;

use crate::db::{self, DbState};
use crate::models::Todo;

pub struct ReminderState {
    handles: Mutex<HashMap<String, JoinHandle<()>>>,
}

impl ReminderState {
    pub fn new() -> Self {
        Self {
            handles: Mutex::new(HashMap::new()),
        }
    }

    fn cancel_all_inner(&self) {
        if let Ok(mut map) = self.handles.lock() {
            for (_, handle) in map.drain() {
                handle.abort();
            }
        }
    }
}

/// Compute minutes-from-midnight for a "HH:MM" string.
fn parse_hhmm(s: &str) -> Option<i64> {
    let parts: Vec<&str> = s.split(':').collect();
    if parts.len() != 2 {
        return None;
    }
    let h: i64 = parts[0].parse().ok()?;
    let m: i64 = parts[1].parse().ok()?;
    Some(h * 60 + m)
}

/// Get today's date key matching the frontend format: "YYYY-MM-DD".
fn today_key() -> String {
    chrono::Local::now().format("%Y-%m-%d").to_string()
}

/// Check if a todo should be reminded today.
fn is_active_today(todo: &Todo) -> bool {
    let today = today_key();
    if todo.duration_days > 1 {
        if todo.completed_day_keys.contains(&today) {
            return false;
        }
        if let (Ok(target), Ok(now)) = (
            chrono::NaiveDate::parse_from_str(&todo.target_date, "%Y-%m-%d"),
            chrono::NaiveDate::parse_from_str(&today, "%Y-%m-%d"),
        ) {
            let end = target + chrono::Duration::days(todo.duration_days as i64 - 1);
            return now >= target && now <= end;
        }
        false
    } else {
        todo.target_date == today
    }
}

/// Reschedule all reminders based on current DB state.
pub fn reschedule_all(app: &AppHandle) {
    let reminder_state = app.state::<ReminderState>();
    reminder_state.cancel_all_inner();

    let db_state = app.state::<DbState>();
    let conn = match db_state.0.lock() {
        Ok(c) => c,
        Err(e) => {
            log::error!("Failed to lock DB for reminders: {}", e);
            return;
        }
    };

    let todos = match db::get_todos(&conn, false) {
        Ok(t) => t,
        Err(e) => {
            log::error!("Failed to load todos for reminders: {}", e);
            return;
        }
    };

    // Release the lock before spawning tasks
    drop(conn);

    let now = chrono::Local::now();
    let now_min = now.hour() as i64 * 60 + now.minute() as i64;

    let mut handles = match reminder_state.handles.lock() {
        Ok(h) => h,
        Err(_) => return,
    };

    for todo in &todos {
        if todo.completed || todo.reminder_mins_before.is_none() {
            continue;
        }
        if !is_active_today(todo) {
            continue;
        }

        let remind_before = todo.reminder_mins_before.unwrap();

        for slot in &todo.time_slots {
            let start_min = match parse_hhmm(&slot.start) {
                Some(m) => m,
                None => continue,
            };

            let alert_min = start_min - remind_before as i64;
            if alert_min <= now_min {
                continue; // Already past
            }

            let delay_secs = (alert_min - now_min) * 60;
            let key = format!("{}-{}", todo.id, slot.id);
            let title = todo.title.clone();
            let mins_before = remind_before;
            let app_handle = app.clone();

            let handle = tokio::spawn(async move {
                tokio::time::sleep(std::time::Duration::from_secs(delay_secs as u64)).await;
                send_notification(&app_handle, &title, mins_before);
            });

            handles.insert(key, handle);
        }
    }

    log::info!("Scheduled {} reminders", handles.len());
}

fn send_notification(app: &AppHandle, title: &str, mins_before: i32) {
    #[cfg(not(test))]
    {
        use tauri_plugin_notification::NotificationExt;
        let body = if mins_before > 0 {
            format!("将在 {} 分钟后开始", mins_before)
        } else {
            "现在开始".to_string()
        };
        if let Err(e) = app
            .notification()
            .builder()
            .title(format!("📋 {}", title))
            .body(&body)
            .show()
        {
            log::error!("Failed to send notification: {}", e);
        }
    }
    #[cfg(test)]
    {
        let _ = (app, title, mins_before);
    }
}

// ── Tauri commands ─────────────────────────────────────────────────────

#[tauri::command]
pub fn reschedule_reminders(app: AppHandle) -> Result<(), crate::error::AppError> {
    reschedule_all(&app);
    Ok(())
}

#[tauri::command]
pub fn cancel_all_reminders(app: AppHandle) -> Result<(), crate::error::AppError> {
    let state = app.state::<ReminderState>();
    state.cancel_all_inner();
    log::info!("All reminders cancelled");
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_todo(target_date: &str, duration_days: u32, completed_day_keys: Vec<String>) -> Todo {
        Todo {
            id: "t1".into(),
            title: "Test".into(),
            completed: false,
            tag_ids: vec![],
            difficulty: 2,
            time_slots: vec![],
            reminder_mins_before: Some(5),
            target_date: target_date.into(),
            order: 0.0,
            created_at: 0.0,
            subtasks: vec![],
            duration_days,
            completed_day_keys,
            archived_day_keys: vec![],
            outgoing_relations: vec![],
            history_date: None,
            history_source_todo_id: None,
            history_kind: None,
        }
    }

    #[test]
    fn parse_hhmm_valid() {
        assert_eq!(parse_hhmm("09:30"), Some(570));
        assert_eq!(parse_hhmm("00:00"), Some(0));
        assert_eq!(parse_hhmm("23:59"), Some(1439));
    }

    #[test]
    fn parse_hhmm_invalid() {
        assert_eq!(parse_hhmm("invalid"), None);
        assert_eq!(parse_hhmm(""), None);
        assert_eq!(parse_hhmm("12"), None);
    }

    #[test]
    fn is_active_today_matching_date() {
        let todo = make_todo(&today_key(), 1, vec![]);
        assert!(is_active_today(&todo));
    }

    #[test]
    fn is_active_today_wrong_date() {
        let todo = make_todo("1999-01-01", 1, vec![]);
        assert!(!is_active_today(&todo));
    }

    #[test]
    fn reminder_state_cancel_all() {
        let state = ReminderState::new();
        state.cancel_all_inner();
    }

    // ── Multi-day task scenarios ──────────────────────────────────────

    #[test]
    fn multi_day_task_active_on_start_date() {
        let today = today_key();
        let todo = make_todo(&today, 3, vec![]);
        assert!(is_active_today(&todo));
    }

    #[test]
    fn multi_day_task_active_on_middle_day() {
        let yesterday = (chrono::Local::now() - chrono::Duration::days(1))
            .format("%Y-%m-%d")
            .to_string();
        let todo = make_todo(&yesterday, 3, vec![]);
        assert!(is_active_today(&todo));
    }

    #[test]
    fn multi_day_task_active_on_last_day() {
        let two_days_ago = (chrono::Local::now() - chrono::Duration::days(2))
            .format("%Y-%m-%d")
            .to_string();
        let todo = make_todo(&two_days_ago, 3, vec![]);
        assert!(is_active_today(&todo));
    }

    #[test]
    fn multi_day_task_inactive_after_end() {
        let four_days_ago = (chrono::Local::now() - chrono::Duration::days(4))
            .format("%Y-%m-%d")
            .to_string();
        let todo = make_todo(&four_days_ago, 3, vec![]);
        assert!(!is_active_today(&todo));
    }

    #[test]
    fn multi_day_task_inactive_before_start() {
        let tomorrow = (chrono::Local::now() + chrono::Duration::days(1))
            .format("%Y-%m-%d")
            .to_string();
        let todo = make_todo(&tomorrow, 3, vec![]);
        assert!(!is_active_today(&todo));
    }

    #[test]
    fn multi_day_task_skipped_when_today_completed() {
        let today = today_key();
        let todo = make_todo(&today, 3, vec![today.clone()]);
        assert!(!is_active_today(&todo));
    }

    #[test]
    fn multi_day_task_active_when_other_day_completed() {
        let yesterday = (chrono::Local::now() - chrono::Duration::days(1))
            .format("%Y-%m-%d")
            .to_string();
        let todo = make_todo(&yesterday, 3, vec![yesterday.clone()]);
        assert!(is_active_today(&todo));
    }

    #[test]
    fn single_day_task_not_affected_by_completed_keys() {
        let today = today_key();
        let todo = make_todo(&today, 1, vec![today.clone()]);
        // Single-day uses simple date match, not completed_day_keys
        assert!(is_active_today(&todo));
    }
}
