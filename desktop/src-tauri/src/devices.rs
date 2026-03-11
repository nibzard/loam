use cpal::traits::{DeviceTrait, HostTrait};
use serde::Serialize;
use std::collections::BTreeSet;

use crate::permissions;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptureDisplay {
    pub id: String,
    pub name: String,
    pub width: u32,
    pub height: u32,
    pub scale_factor: f32,
    pub is_primary: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptureWindow {
    pub id: String,
    pub name: String,
    pub owner_name: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MicrophoneDevice {
    pub id: String,
    pub name: String,
    pub is_default: bool,
}

#[tauri::command]
pub fn list_capture_displays() -> Result<Vec<CaptureDisplay>, String> {
    let monitors = xcap::Monitor::all().map_err(|error| error.to_string())?;
    let mut displays = Vec::with_capacity(monitors.len());

    for monitor in monitors {
        displays.push(CaptureDisplay {
            id: monitor.id().map_err(|error| error.to_string())?.to_string(),
            name: monitor.name().map_err(|error| error.to_string())?,
            width: monitor.width().map_err(|error| error.to_string())?,
            height: monitor.height().map_err(|error| error.to_string())?,
            scale_factor: monitor.scale_factor().map_err(|error| error.to_string())?,
            is_primary: monitor.is_primary().map_err(|error| error.to_string())?,
        });
    }

    Ok(displays)
}

#[tauri::command]
pub fn list_capture_windows() -> Result<Vec<CaptureWindow>, String> {
    let windows = xcap::Window::all().map_err(|error| error.to_string())?;
    let mut capture_windows = Vec::new();

    for window in windows {
        let title = window.title().map_err(|error| error.to_string())?;
        if title.trim().is_empty() {
            continue;
        }

        capture_windows.push(CaptureWindow {
            id: window.id().map_err(|error| error.to_string())?.to_string(),
            name: title,
            owner_name: window.app_name().map_err(|error| error.to_string())?,
        });
    }

    Ok(capture_windows)
}

#[tauri::command]
pub fn list_microphones() -> Result<Vec<MicrophoneDevice>, String> {
    if !permissions::microphone_permission_status().permitted() {
        return Ok(Vec::new());
    }

    let host = cpal::default_host();
    let default_name = host
        .default_input_device()
        .and_then(|device| device.name().ok());
    let devices = host.input_devices().map_err(|error| error.to_string())?;
    let mut seen_names = BTreeSet::new();
    let mut microphones = Vec::new();

    for device in devices {
        let name = match device.name() {
            Ok(name) if !name.trim().is_empty() => name,
            Ok(_) => continue,
            Err(error) => return Err(error.to_string()),
        };

        if !seen_names.insert(name.clone()) {
            continue;
        }

        microphones.push(MicrophoneDevice {
            id: name.clone(),
            is_default: default_name.as_deref() == Some(name.as_str()),
            name,
        });
    }

    Ok(microphones)
}

#[tauri::command]
pub fn is_system_audio_supported() -> bool {
    cfg!(target_os = "macos")
}
