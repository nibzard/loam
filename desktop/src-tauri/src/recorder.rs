use std::{
    path::PathBuf,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use serde::{Deserialize, Serialize};
use tauri::State;

use crate::{
    errors::RecorderError,
    permissions::{self, PermissionStatus},
    state::RecorderState,
};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", tag = "kind")]
pub enum CaptureTarget {
    Display { id: String, name: String },
    Window {
        id: String,
        name: String,
        owner_name: String,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartRecordingInput {
    pub target: CaptureTarget,
    pub microphone_name: Option<String>,
    pub capture_system_audio: bool,
    pub countdown_seconds: u64,
}

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum RecordingPhase {
    Recording,
    Paused,
    Stopping,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecordingSnapshot {
    pub phase: RecordingPhase,
    pub recording_dir: String,
    pub video_path: String,
    pub thumbnail_path: Option<String>,
    pub target: CaptureTarget,
    pub microphone_name: Option<String>,
    pub capture_system_audio: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecordingStopped {
    pub recording_dir: String,
    pub video_path: String,
    pub thumbnail_path: Option<String>,
    pub duration_seconds: Option<f64>,
    pub file_size_bytes: Option<u64>,
}

pub enum NativeRecorderSlot {
    Idle,
    Active(ActiveRecording),
    Stopping,
}

pub struct ActiveRecording {
    phase: RecordingPhase,
    input: StartRecordingInput,
    recording_dir: PathBuf,
    video_path: PathBuf,
    thumbnail_path: Option<PathBuf>,
    started_at: SystemTime,
    paused_duration: Duration,
    pause_started_at: Option<SystemTime>,
    #[cfg(target_os = "macos")]
    handle: MacosRecordingHandle,
}

impl ActiveRecording {
    fn snapshot(&self) -> RecordingSnapshot {
        RecordingSnapshot {
            phase: self.phase,
            recording_dir: self.recording_dir.display().to_string(),
            video_path: self.video_path.display().to_string(),
            thumbnail_path: self
                .thumbnail_path
                .as_ref()
                .map(|path| path.display().to_string()),
            target: self.input.target.clone(),
            microphone_name: self.input.microphone_name.clone(),
            capture_system_audio: self.input.capture_system_audio,
        }
    }

    fn duration_seconds(&self) -> Option<f64> {
        let mut paused_duration = self.paused_duration;

        if let Some(paused_at) = self.pause_started_at {
            paused_duration += SystemTime::now().duration_since(paused_at).ok()?;
        }

        let elapsed = SystemTime::now().duration_since(self.started_at).ok()?;
        elapsed.checked_sub(paused_duration).map(|duration| duration.as_secs_f64())
    }
}

#[cfg(target_os = "macos")]
struct MacosRecordingHandle {
    actor: cap_recording::instant_recording::ActorHandle,
}

#[tauri::command(async)]
pub async fn start_recording(
    state: State<'_, RecorderState>,
    input: StartRecordingInput,
) -> Result<RecordingSnapshot, String> {
    {
        let guard = state.inner.lock().await;
        match &*guard {
            NativeRecorderSlot::Idle => {}
            NativeRecorderSlot::Active(_) => {
                return Err(RecorderError::RecordingAlreadyInProgress.into_string());
            }
            NativeRecorderSlot::Stopping => {
                return Err(RecorderError::RecorderIsStopping.into_string());
            }
        }
    }

    ensure_recording_preconditions(&input)?;

    if input.countdown_seconds > 0 {
        tokio::time::sleep(Duration::from_secs(input.countdown_seconds)).await;
    }

    ensure_recording_preconditions(&input)?;

    let recording = start_platform_recording(input).await.map_err(RecorderError::into_string)?;
    let snapshot = recording.snapshot();

    let mut guard = state.inner.lock().await;
    *guard = NativeRecorderSlot::Active(recording);

    Ok(snapshot)
}

#[tauri::command(async)]
pub async fn pause_recording(
    state: State<'_, RecorderState>,
) -> Result<RecordingSnapshot, String> {
    let mut guard = state.inner.lock().await;
    let recording = match &mut *guard {
        NativeRecorderSlot::Active(recording) => recording,
        NativeRecorderSlot::Idle => return Err(RecorderError::RecordingNotInProgress.into_string()),
        NativeRecorderSlot::Stopping => return Err(RecorderError::RecorderIsStopping.into_string()),
    };

    if matches!(recording.phase, RecordingPhase::Paused) {
        return Err(RecorderError::RecordingAlreadyPaused.into_string());
    }

    pause_platform_recording(recording)
        .await
        .map_err(RecorderError::into_string)?;
    recording.phase = RecordingPhase::Paused;
    recording.pause_started_at = Some(SystemTime::now());

    Ok(recording.snapshot())
}

#[tauri::command(async)]
pub async fn resume_recording(
    state: State<'_, RecorderState>,
) -> Result<RecordingSnapshot, String> {
    let mut guard = state.inner.lock().await;
    let recording = match &mut *guard {
        NativeRecorderSlot::Active(recording) => recording,
        NativeRecorderSlot::Idle => return Err(RecorderError::RecordingNotInProgress.into_string()),
        NativeRecorderSlot::Stopping => return Err(RecorderError::RecorderIsStopping.into_string()),
    };

    if !matches!(recording.phase, RecordingPhase::Paused) {
        return Err(RecorderError::RecordingNotPaused.into_string());
    }

    resume_platform_recording(recording)
        .await
        .map_err(RecorderError::into_string)?;

    if let Some(paused_at) = recording.pause_started_at.take() {
        if let Ok(paused_for) = SystemTime::now().duration_since(paused_at) {
            recording.paused_duration += paused_for;
        }
    }

    recording.phase = RecordingPhase::Recording;

    Ok(recording.snapshot())
}

#[tauri::command(async)]
pub async fn stop_recording(
    state: State<'_, RecorderState>,
) -> Result<RecordingStopped, String> {
    let active = {
        let mut guard = state.inner.lock().await;
        match std::mem::replace(&mut *guard, NativeRecorderSlot::Stopping) {
            NativeRecorderSlot::Active(recording) => recording,
            NativeRecorderSlot::Idle => {
                *guard = NativeRecorderSlot::Idle;
                return Err(RecorderError::RecordingNotInProgress.into_string());
            }
            NativeRecorderSlot::Stopping => {
                *guard = NativeRecorderSlot::Stopping;
                return Err(RecorderError::RecorderIsStopping.into_string());
            }
        }
    };

    let stop_result = stop_platform_recording(active).await;

    let mut guard = state.inner.lock().await;
    *guard = NativeRecorderSlot::Idle;

    stop_result.map_err(RecorderError::into_string)
}

#[tauri::command(async)]
pub async fn cancel_recording(state: State<'_, RecorderState>) -> Result<(), String> {
    let active = {
        let mut guard = state.inner.lock().await;
        match std::mem::replace(&mut *guard, NativeRecorderSlot::Idle) {
            NativeRecorderSlot::Active(recording) => recording,
            NativeRecorderSlot::Idle => return Err(RecorderError::RecordingNotInProgress.into_string()),
            NativeRecorderSlot::Stopping => return Err(RecorderError::RecorderIsStopping.into_string()),
        }
    };

    cancel_platform_recording(active)
        .await
        .map_err(RecorderError::into_string)
}

#[tauri::command(async)]
pub async fn get_current_recording(
    state: State<'_, RecorderState>,
) -> Result<Option<RecordingSnapshot>, String> {
    let guard = state.inner.lock().await;

    Ok(match &*guard {
        NativeRecorderSlot::Idle => None,
        NativeRecorderSlot::Active(recording) => Some(recording.snapshot()),
        NativeRecorderSlot::Stopping => None,
    })
}

#[cfg(target_os = "macos")]
async fn start_platform_recording(input: StartRecordingInput) -> Result<ActiveRecording, RecorderError> {
    use cap_recording::{
        instant_recording,
        screen_capture::ScreenCaptureTarget,
        MicrophoneFeed, SendableShareableContent,
        feeds::microphone::{Lock, SetInput},
    };
    use kameo::prelude::Actor;

    let recording_dir = make_recording_dir()?;
    let video_path = recording_dir.join("content").join("output.mp4");
    let target = into_screen_capture_target(&input.target)?;

    let mut builder = instant_recording::Actor::builder(recording_dir.clone(), target)
        .with_system_audio(input.capture_system_audio);

    if let Some(microphone_name) = input.microphone_name.as_ref() {
        let (error_tx, _error_rx) = flume::bounded(1);
        let mic_feed = MicrophoneFeed::spawn(MicrophoneFeed::new(error_tx));
        let ready = mic_feed
            .ask(SetInput {
                label: microphone_name.clone(),
            })
            .await
            .map_err(|error| RecorderError::Recording(error.to_string()))?
            .map_err(|_| RecorderError::MicrophoneNotFound)?;

        ready
            .await
            .map_err(|error| RecorderError::Recording(error.to_string()))?;

        let mic_lock = mic_feed
            .ask(Lock)
            .await
            .map_err(|error| RecorderError::Recording(error.to_string()))?
            .map_err(|error| RecorderError::Recording(error.to_string()))?;

        builder = builder.with_mic_feed(std::sync::Arc::new(mic_lock));
    }

    let shareable_content = cidre::sc::ShareableContent::current()
        .await
        .map_err(|error| RecorderError::Recording(error.to_string()))?;

    let actor = builder
        .build(Some(SendableShareableContent::from(shareable_content)))
        .await
        .map_err(|error| RecorderError::Recording(error.to_string()))?;

    Ok(ActiveRecording {
        phase: RecordingPhase::Recording,
        input,
        recording_dir,
        video_path,
        thumbnail_path: None,
        started_at: SystemTime::now(),
        paused_duration: Duration::ZERO,
        pause_started_at: None,
        handle: MacosRecordingHandle { actor },
    })
}

#[cfg(not(target_os = "macos"))]
async fn start_platform_recording(
    _input: StartRecordingInput,
) -> Result<ActiveRecording, RecorderError> {
    Err(RecorderError::UnsupportedPlatform)
}

#[cfg(target_os = "macos")]
async fn pause_platform_recording(recording: &mut ActiveRecording) -> Result<(), RecorderError> {
    recording
        .handle
        .actor
        .pause()
        .await
        .map_err(|error| RecorderError::Recording(error.to_string()))
}

#[cfg(not(target_os = "macos"))]
async fn pause_platform_recording(_recording: &mut ActiveRecording) -> Result<(), RecorderError> {
    Err(RecorderError::UnsupportedPlatform)
}

#[cfg(target_os = "macos")]
async fn resume_platform_recording(recording: &mut ActiveRecording) -> Result<(), RecorderError> {
    recording
        .handle
        .actor
        .resume()
        .await
        .map_err(|error| RecorderError::Recording(error.to_string()))
}

#[cfg(not(target_os = "macos"))]
async fn resume_platform_recording(_recording: &mut ActiveRecording) -> Result<(), RecorderError> {
    Err(RecorderError::UnsupportedPlatform)
}

#[cfg(target_os = "macos")]
async fn stop_platform_recording(recording: ActiveRecording) -> Result<RecordingStopped, RecorderError> {
    recording
        .handle
        .actor
        .stop()
        .await
        .map_err(|error| RecorderError::Recording(error.to_string()))?;

    build_stopped_payload(recording)
}

#[cfg(not(target_os = "macos"))]
async fn stop_platform_recording(_recording: ActiveRecording) -> Result<RecordingStopped, RecorderError> {
    Err(RecorderError::UnsupportedPlatform)
}

#[cfg(target_os = "macos")]
async fn cancel_platform_recording(recording: ActiveRecording) -> Result<(), RecorderError> {
    recording
        .handle
        .actor
        .cancel()
        .await
        .map_err(|error| RecorderError::Recording(error.to_string()))
}

#[cfg(not(target_os = "macos"))]
async fn cancel_platform_recording(_recording: ActiveRecording) -> Result<(), RecorderError> {
    Err(RecorderError::UnsupportedPlatform)
}

fn build_stopped_payload(recording: ActiveRecording) -> Result<RecordingStopped, RecorderError> {
    let file_size_bytes = std::fs::metadata(&recording.video_path)
        .ok()
        .map(|metadata| metadata.len());

    Ok(RecordingStopped {
        recording_dir: recording.recording_dir.display().to_string(),
        video_path: recording.video_path.display().to_string(),
        thumbnail_path: recording
            .thumbnail_path
            .as_ref()
            .map(|path| path.display().to_string()),
        duration_seconds: recording.duration_seconds(),
        file_size_bytes,
    })
}

fn ensure_recording_preconditions(input: &StartRecordingInput) -> Result<(), RecorderError> {
    if !permissions::screen_permission_status(false).permitted() {
        return Err(RecorderError::MissingScreenPermission);
    }

    if input.microphone_name.is_some()
        && !matches!(
            permissions::microphone_permission_status(),
            PermissionStatus::Granted | PermissionStatus::NotNeeded
        )
    {
        return Err(RecorderError::MissingMicrophonePermission);
    }

    Ok(())
}

fn make_recording_dir() -> Result<PathBuf, RecorderError> {
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| RecorderError::Recording(error.to_string()))?
        .as_millis();
    let recording_dir = std::env::temp_dir()
        .join("loam-desktop-recordings")
        .join(format!("recording-{timestamp}"));

    std::fs::create_dir_all(&recording_dir)?;

    Ok(recording_dir)
}

#[cfg(target_os = "macos")]
fn into_screen_capture_target(
    target: &CaptureTarget,
) -> Result<cap_recording::screen_capture::ScreenCaptureTarget, RecorderError> {
    use cap_recording::screen_capture::ScreenCaptureTarget;
    use scap_targets::{Display, DisplayId, Window, WindowId};
    use std::str::FromStr;

    match target {
        CaptureTarget::Display { id, .. } => {
            let display_id = DisplayId::from_str(id).map_err(|_| RecorderError::InvalidCaptureTarget)?;
            if Display::from_id(&display_id).is_none() {
                return Err(RecorderError::TargetNotFound);
            }

            Ok(ScreenCaptureTarget::Display { id: display_id })
        }
        CaptureTarget::Window { id, .. } => {
            let window_id = WindowId::from_str(id).map_err(|_| RecorderError::InvalidCaptureTarget)?;
            if Window::from_id(&window_id).is_none() {
                return Err(RecorderError::TargetNotFound);
            }

            Ok(ScreenCaptureTarget::Window { id: window_id })
        }
    }
}
