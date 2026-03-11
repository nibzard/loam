#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod devices;
mod permissions;

use serde::Serialize;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct DesktopShellStatus {
    app_name: &'static str,
    platform: &'static str,
    shell_version: &'static str,
}

#[tauri::command]
fn get_shell_status() -> DesktopShellStatus {
    DesktopShellStatus {
        app_name: "loam-desktop",
        platform: std::env::consts::OS,
        shell_version: env!("CARGO_PKG_VERSION"),
    }
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            get_shell_status,
            permissions::check_permissions,
            permissions::request_permission,
            permissions::open_permission_settings,
            devices::list_capture_displays,
            devices::list_capture_windows,
            devices::list_microphones,
            devices::is_system_audio_supported
        ])
        .run(tauri::generate_context!())
        .expect("failed to run loam desktop shell");
}
