mod commands;
mod db;
mod error;
mod models;
mod reminders;

use std::sync::Mutex;

use tauri::{
    menu::{MenuBuilder, MenuItemBuilder},
    tray::TrayIconBuilder,
    Manager,
};
use tauri_plugin_autostart::MacosLauncher;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};
use tauri_plugin_log::{Target, TargetKind};

use db::DbState;
use reminders::ReminderState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(
            tauri_plugin_log::Builder::new()
                .targets([
                    Target::new(TargetKind::Stdout),
                    Target::new(TargetKind::LogDir { file_name: None }),
                ])
                .build(),
        )
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(vec!["--autostarted"]),
        ))
        .invoke_handler(tauri::generate_handler![
            commands::todos::get_todos,
            commands::todos::save_todo,
            commands::todos::save_todos,
            commands::todos::delete_todo,
            commands::todos::archive_todos,
            commands::tags::get_tags,
            commands::tags::save_tag,
            commands::tags::delete_tag,
            commands::tags::get_tag_groups,
            commands::tags::save_tag_group,
            commands::tags::delete_tag_group,
            commands::settings::get_all_settings,
            commands::settings::save_settings,
            commands::settings::check_needs_migration,
            commands::settings::migrate_from_legacy,
            commands::export::export_data,
            commands::export::import_data,
            commands::export::save_poster,
            reminders::reschedule_reminders,
            reminders::cancel_all_reminders,
        ])
        .setup(|app| {
            // ── Initialize SQLite ──────────────────────────────────────
            let app_data_dir = app
                .path()
                .app_data_dir()
                .expect("Failed to resolve app data dir");
            let db_path = app_data_dir.join("tinydo.db");
            let conn = db::init_db(&db_path)?;
            app.manage(DbState(Mutex::new(conn)));
            app.manage(ReminderState::new());

            // ── System tray ────────────────────────────────────────────
            let show = MenuItemBuilder::with_id("show", "显示 TinyDo").build(app)?;
            let quit = MenuItemBuilder::with_id("quit", "退出").build(app)?;
            let menu = MenuBuilder::new(app).items(&[&show, &quit]).build()?;

            TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("TinyDo")
                .menu(&menu)
                .on_menu_event(move |app, event| match event.id().as_ref() {
                    "show" => show_main_window(app),
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let tauri::tray::TrayIconEvent::Click {
                        button: tauri::tray::MouseButton::Left,
                        ..
                    } = event
                    {
                        show_main_window(tray.app_handle());
                    }
                })
                .build(app)?;

            // ── Global shortcut: Ctrl+Shift+T to toggle window ────────
            let shortcut: Shortcut = "ctrl+shift+t".parse().unwrap();
            let app_handle = app.handle().clone();
            app.global_shortcut()
                .on_shortcut(shortcut, move |_app, _shortcut, event| {
                    if event.state == ShortcutState::Pressed {
                        toggle_main_window(&app_handle);
                    }
                })?;

            // ── Schedule reminders from DB ─────────────────────────────
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                reminders::reschedule_all(&handle);
            });

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if let Err(e) = window.hide() {
                    log::error!("Failed to hide window: {}", e);
                }
                api.prevent_close();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn show_main_window(app: &tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        if let Err(e) = w.show() {
            log::error!("Failed to show window: {}", e);
        }
        if let Err(e) = w.unminimize() {
            log::error!("Failed to unminimize window: {}", e);
        }
        if let Err(e) = w.set_focus() {
            log::error!("Failed to set focus: {}", e);
        }
    }
}

fn toggle_main_window(app: &tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let visible = w.is_visible().unwrap_or(false);
        if visible {
            let focused = w.is_focused().unwrap_or(false);
            if focused {
                let _ = w.hide();
            } else {
                let _ = w.set_focus();
            }
        } else {
            show_main_window(app);
        }
    }
}
