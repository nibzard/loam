#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use loam_desktop::{browser, devices, permissions, recorder, state, upload};
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
        .manage(state::RecorderState::default())
        .manage(state::UploadState::default())
        .invoke_handler(tauri::generate_handler![
            get_shell_status,
            browser::open_external_url,
            permissions::check_permissions,
            permissions::request_permission,
            permissions::open_permission_settings,
            devices::list_capture_displays,
            devices::list_capture_windows,
            devices::list_microphones,
            devices::is_system_audio_supported,
            recorder::start_recording,
            recorder::pause_recording,
            recorder::resume_recording,
            recorder::stop_recording,
            recorder::cancel_recording,
            recorder::get_current_recording,
            upload::upload_file,
            upload::cancel_upload
        ])
        .run(tauri::generate_context!())
        .expect("failed to run loam desktop shell");
}
