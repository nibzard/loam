use std::process::Command;

use url::Url;

use crate::errors::RecorderError;

#[tauri::command]
pub fn open_external_url(url: String) -> Result<(), String> {
    open_external_http_url(&url).map_err(RecorderError::into_string)
}

fn open_external_http_url(url: &str) -> Result<(), RecorderError> {
    let parsed = Url::parse(url).map_err(|_| RecorderError::InvalidExternalUrl)?;

    if !matches!(parsed.scheme(), "http" | "https") {
        return Err(RecorderError::InvalidExternalUrl);
    }

    open_external_url_with_system(url)
}

#[cfg(target_os = "macos")]
fn open_external_url_with_system(url: &str) -> Result<(), RecorderError> {
    let status = Command::new("open").arg(url).status()?;
    ensure_open_status(status, "open")
}

#[cfg(target_os = "linux")]
fn open_external_url_with_system(url: &str) -> Result<(), RecorderError> {
    let status = Command::new("xdg-open").arg(url).status()?;
    ensure_open_status(status, "xdg-open")
}

#[cfg(target_os = "windows")]
fn open_external_url_with_system(url: &str) -> Result<(), RecorderError> {
    let status = Command::new("cmd")
        .args(["/C", "start", "", url])
        .status()?;
    ensure_open_status(status, "start")
}

#[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
fn open_external_url_with_system(_url: &str) -> Result<(), RecorderError> {
    Err(RecorderError::UnsupportedPlatform)
}

fn ensure_open_status(status: std::process::ExitStatus, command_name: &str) -> Result<(), RecorderError> {
    if status.success() {
        return Ok(());
    }

    Err(RecorderError::ExternalOpenFailed(format!(
        "{command_name} exited with status {status}"
    )))
}
