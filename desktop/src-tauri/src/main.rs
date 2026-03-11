#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

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
        .invoke_handler(tauri::generate_handler![get_shell_status])
        .run(tauri::generate_context!())
        .expect("failed to run loam desktop shell");
}
