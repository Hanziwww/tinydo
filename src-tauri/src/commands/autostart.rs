use tauri::AppHandle;

use crate::error::AppError;

const AUTOSTART_ARG: &str = "--autostarted";

#[tauri::command]
pub fn get_autostart_enabled(app: AppHandle) -> Result<bool, AppError> {
    #[cfg(target_os = "windows")]
    {
        return windows::is_enabled(&app)
            .map_err(|error| AppError::custom(format!("读取开机自启动状态失败：{error}")));
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = app;
        Err(AppError::custom("该命令仅用于 Windows 桌面端"))
    }
}

#[tauri::command]
pub fn set_autostart_enabled(app: AppHandle, enabled: bool) -> Result<bool, AppError> {
    #[cfg(target_os = "windows")]
    {
        windows::set_enabled(&app, enabled)
            .map_err(|error| AppError::custom(format!("设置开机自启动失败：{error}")))?;
        return windows::is_enabled(&app)
            .map_err(|error| AppError::custom(format!("读取开机自启动状态失败：{error}")));
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = (app, enabled);
        Err(AppError::custom("该命令仅用于 Windows 桌面端"))
    }
}

pub fn heal_windows_autostart_if_needed(app: &AppHandle) {
    #[cfg(target_os = "windows")]
    {
        use std::{env, ffi::OsStr};

        if env::args_os().any(|arg| arg == OsStr::new(AUTOSTART_ARG)) {
            if let Err(error) = windows::set_enabled(app, true) {
                log::warn!("Failed to heal Windows autostart registration: {}", error);
            }
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = app;
    }
}

#[cfg(target_os = "windows")]
mod windows {
    use std::{env, io};

    use tauri::AppHandle;
    use winreg::{
        enums::{HKEY_CURRENT_USER, KEY_SET_VALUE, REG_BINARY},
        RegKey, RegValue,
    };

    use super::AUTOSTART_ARG;

    const RUN_KEY_PATH: &str = r"Software\Microsoft\Windows\CurrentVersion\Run";
    const STARTUP_APPROVED_KEY_PATH: &str =
        r"Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run";
    const STARTUP_APPROVED_ENABLED_VALUE: [u8; 12] = [
        0x02, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    ];

    pub(super) fn is_enabled(app: &AppHandle) -> io::Result<bool> {
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let name = entry_name(app);
        let expected_command = autostart_command()?;

        let run_key = match hkcu.open_subkey(RUN_KEY_PATH) {
            Ok(key) => key,
            Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(false),
            Err(error) => return Err(error),
        };

        let actual_command: String = match run_key.get_value(name.as_str()) {
            Ok(value) => value,
            Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(false),
            Err(error) => return Err(error),
        };

        if actual_command.trim() != expected_command {
            return Ok(false);
        }

        startup_approved_is_enabled(&hkcu, name.as_str())
    }

    pub(super) fn set_enabled(app: &AppHandle, enabled: bool) -> io::Result<()> {
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let name = entry_name(app);

        if enabled {
            let command = autostart_command()?;
            let (run_key, _) = hkcu.create_subkey(RUN_KEY_PATH)?;
            run_key.set_value(name.as_str(), &command)?;

            let (startup_key, _) = hkcu.create_subkey(STARTUP_APPROVED_KEY_PATH)?;
            startup_key.set_raw_value(
                name.as_str(),
                &RegValue {
                    bytes: STARTUP_APPROVED_ENABLED_VALUE.to_vec().into(),
                    vtype: REG_BINARY,
                },
            )?;
        } else {
            delete_value_if_exists(&hkcu, RUN_KEY_PATH, name.as_str())?;
            delete_value_if_exists(&hkcu, STARTUP_APPROVED_KEY_PATH, name.as_str())?;
        }

        Ok(())
    }

    fn entry_name(app: &AppHandle) -> String {
        app.package_info().name.clone()
    }

    fn autostart_command() -> io::Result<String> {
        let exe = env::current_exe()?;
        let exe = exe.to_str().ok_or_else(|| {
            io::Error::new(io::ErrorKind::InvalidData, "程序路径包含无法识别的字符")
        })?;
        Ok(format!("\"{exe}\" {AUTOSTART_ARG}"))
    }

    fn startup_approved_is_enabled(root: &RegKey, name: &str) -> io::Result<bool> {
        let startup_key = match root.open_subkey(STARTUP_APPROVED_KEY_PATH) {
            Ok(key) => key,
            Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(true),
            Err(error) => return Err(error),
        };

        match startup_key.get_raw_value(name) {
            Ok(value) => Ok(last_eight_bytes_all_zero(&value.bytes).unwrap_or(true)),
            Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(true),
            Err(error) => Err(error),
        }
    }

    fn delete_value_if_exists(root: &RegKey, key_path: &str, name: &str) -> io::Result<()> {
        let key = match root.open_subkey_with_flags(key_path, KEY_SET_VALUE) {
            Ok(key) => key,
            Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(()),
            Err(error) => return Err(error),
        };

        match key.delete_value(name) {
            Ok(()) => Ok(()),
            Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(()),
            Err(error) => Err(error),
        }
    }

    fn last_eight_bytes_all_zero(bytes: &[u8]) -> Result<bool, ()> {
        if bytes.len() < 8 {
            return Err(());
        }
        Ok(bytes.iter().rev().take(8).all(|value| *value == 0))
    }
}
