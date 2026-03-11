use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum PermissionKind {
    Screen,
    Microphone,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum PermissionStatus {
    NotNeeded,
    Empty,
    Granted,
    Denied,
}

impl PermissionStatus {
    pub fn permitted(&self) -> bool {
        matches!(self, Self::NotNeeded | Self::Granted)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PermissionSnapshot {
    pub screen: PermissionStatus,
    pub microphone: PermissionStatus,
}

#[tauri::command]
pub fn check_permissions(initial_check: Option<bool>) -> PermissionSnapshot {
    let initial_check = initial_check.unwrap_or(false);

    PermissionSnapshot {
        screen: screen_permission_status(initial_check),
        microphone: microphone_permission_status(),
    }
}

#[tauri::command(async)]
pub async fn request_permission(permission: PermissionKind) -> Result<PermissionStatus, String> {
    #[cfg(target_os = "macos")]
    {
        match permission {
            PermissionKind::Screen => {
                let granted = unsafe { CGRequestScreenCaptureAccess() };
                Ok(if granted {
                    PermissionStatus::Granted
                } else {
                    PermissionStatus::Denied
                })
            }
            PermissionKind::Microphone => {
                tauri::async_runtime::spawn_blocking(|| {
                    futures::executor::block_on(cidre::av::CaptureDevice::request_access_for_media_type(
                        cidre::av::MediaType::audio(),
                    ))
                    .map_err(|error| error.to_string())
                })
                .await
                .map_err(|error| error.to_string())?
                .map(|granted| {
                    if granted {
                        PermissionStatus::Granted
                    } else {
                        PermissionStatus::Denied
                    }
                })
            }
        }
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = permission;
        Ok(PermissionStatus::NotNeeded)
    }
}

#[tauri::command]
pub fn open_permission_settings(permission: PermissionKind) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        use std::process::Command;

        let url = match permission {
            PermissionKind::Screen => {
                "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture"
            }
            PermissionKind::Microphone => {
                "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone"
            }
        };

        Command::new("open")
            .arg(url)
            .spawn()
            .map_err(|error| error.to_string())?;

        Ok(())
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = permission;
        Ok(())
    }
}

pub(crate) fn microphone_permission_status() -> PermissionStatus {
    #[cfg(target_os = "macos")]
    {
        use cidre::av::{AuthorizationStatus, CaptureDevice, MediaType};

        match CaptureDevice::authorization_status_for_media_type(MediaType::audio()) {
            Ok(AuthorizationStatus::NotDetermined) => PermissionStatus::Empty,
            Ok(AuthorizationStatus::Authorized) => PermissionStatus::Granted,
            Ok(_) => PermissionStatus::Denied,
            Err(_) => PermissionStatus::Denied,
        }
    }

    #[cfg(not(target_os = "macos"))]
    {
        PermissionStatus::NotNeeded
    }
}

pub(crate) fn screen_permission_status(initial_check: bool) -> PermissionStatus {
    #[cfg(target_os = "macos")]
    {
        let granted = unsafe { CGPreflightScreenCaptureAccess() };

        match (granted, initial_check) {
            (true, _) => PermissionStatus::Granted,
            (false, true) => PermissionStatus::Empty,
            (false, false) => PermissionStatus::Denied,
        }
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = initial_check;
        PermissionStatus::NotNeeded
    }
}

#[cfg(target_os = "macos")]
#[link(name = "ApplicationServices", kind = "framework")]
unsafe extern "C" {
    fn CGPreflightScreenCaptureAccess() -> bool;
    fn CGRequestScreenCaptureAccess() -> bool;
}
