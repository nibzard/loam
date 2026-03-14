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

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecordingOutputValidation {
    pub recording_dir: String,
    pub video_path: String,
    pub thumbnail_path: Option<String>,
    pub duration_seconds: f64,
    pub file_size_bytes: u64,
}

pub enum NativeRecorderSlot {
    Idle,
    Starting,
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
        let mut guard = state.inner.lock().await;
        match &*guard {
            NativeRecorderSlot::Idle => {
                *guard = NativeRecorderSlot::Starting;
            }
            NativeRecorderSlot::Starting | NativeRecorderSlot::Active(_) => {
                return Err(RecorderError::RecordingAlreadyInProgress.into_string());
            }
            NativeRecorderSlot::Stopping => {
                return Err(RecorderError::RecorderIsStopping.into_string());
            }
        }
    }

    let start_result = async {
        ensure_recording_preconditions(&input)?;

        if input.countdown_seconds > 0 {
            tokio::time::sleep(Duration::from_secs(input.countdown_seconds)).await;
        }

        ensure_recording_preconditions(&input)?;

        start_platform_recording(input).await
    }
    .await;

    let mut guard = state.inner.lock().await;
    match start_result {
        Ok(recording) => {
            let snapshot = recording.snapshot();
            *guard = NativeRecorderSlot::Active(recording);
            Ok(snapshot)
        }
        Err(error) => {
            if matches!(&*guard, NativeRecorderSlot::Starting) {
                *guard = NativeRecorderSlot::Idle;
            }

            Err(error.into_string())
        }
    }
}

#[tauri::command(async)]
pub async fn pause_recording(
    state: State<'_, RecorderState>,
) -> Result<RecordingSnapshot, String> {
    let mut guard = state.inner.lock().await;
    let recording = match &mut *guard {
        NativeRecorderSlot::Active(recording) => recording,
        NativeRecorderSlot::Starting => {
            return Err(RecorderError::RecordingAlreadyInProgress.into_string());
        }
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
        NativeRecorderSlot::Starting => {
            return Err(RecorderError::RecordingAlreadyInProgress.into_string());
        }
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
            NativeRecorderSlot::Starting => {
                *guard = NativeRecorderSlot::Starting;
                return Err(RecorderError::RecordingAlreadyInProgress.into_string());
            }
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
            NativeRecorderSlot::Starting => {
                *guard = NativeRecorderSlot::Starting;
                return Err(RecorderError::RecordingAlreadyInProgress.into_string());
            }
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
        NativeRecorderSlot::Starting => None,
        NativeRecorderSlot::Active(recording) => Some(recording.snapshot()),
        NativeRecorderSlot::Stopping => None,
    })
}

pub async fn run_smoke_recording(
    input: StartRecordingInput,
    capture_duration: Duration,
) -> Result<RecordingOutputValidation, RecorderError> {
    ensure_recording_preconditions(&input)?;

    let recording = start_platform_recording(input).await?;
    tokio::time::sleep(capture_duration).await;
    let stopped = stop_platform_recording(recording).await?;

    validate_recording_output(&stopped)
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
    stopped_payload_from_paths(
        &recording.recording_dir,
        &recording.video_path,
        recording.thumbnail_path.as_ref(),
        recording.duration_seconds(),
    )
}

fn stopped_payload_from_paths(
    recording_dir: &std::path::Path,
    video_path: &std::path::Path,
    thumbnail_path: Option<&PathBuf>,
    duration_seconds: Option<f64>,
) -> Result<RecordingStopped, RecorderError> {
    let file_size_bytes = std::fs::metadata(video_path)
        .ok()
        .map(|metadata| metadata.len());

    Ok(RecordingStopped {
        recording_dir: recording_dir.display().to_string(),
        video_path: video_path.display().to_string(),
        thumbnail_path: thumbnail_path.map(|path| path.display().to_string()),
        duration_seconds,
        file_size_bytes,
    })
}

pub fn validate_recording_output(
    stopped: &RecordingStopped,
) -> Result<RecordingOutputValidation, RecorderError> {
    let recording_dir = PathBuf::from(&stopped.recording_dir);
    if !recording_dir.is_dir() {
        return Err(RecorderError::InvalidRecordingOutput(format!(
            "recording directory does not exist: {}",
            recording_dir.display()
        )));
    }

    let video_path = PathBuf::from(&stopped.video_path);
    let video_metadata = std::fs::metadata(&video_path).map_err(|_| {
        RecorderError::InvalidRecordingOutput(format!(
            "video file does not exist: {}",
            video_path.display()
        ))
    })?;

    if !video_metadata.is_file() {
        return Err(RecorderError::InvalidRecordingOutput(format!(
            "video path is not a file: {}",
            video_path.display()
        )));
    }

    let file_size_bytes = stopped.file_size_bytes.ok_or_else(|| {
        RecorderError::InvalidRecordingOutput("stop payload is missing fileSizeBytes".to_string())
    })?;

    if file_size_bytes == 0 {
        return Err(RecorderError::InvalidRecordingOutput(
            "stop payload reported an empty output file".to_string(),
        ));
    }

    if video_metadata.len() != file_size_bytes {
        return Err(RecorderError::InvalidRecordingOutput(format!(
            "stop payload fileSizeBytes {} did not match disk metadata {}",
            file_size_bytes,
            video_metadata.len()
        )));
    }

    let duration_seconds = stopped.duration_seconds.ok_or_else(|| {
        RecorderError::InvalidRecordingOutput("stop payload is missing durationSeconds".to_string())
    })?;

    if !duration_seconds.is_finite() || duration_seconds <= 0.0 {
        return Err(RecorderError::InvalidRecordingOutput(format!(
            "stop payload reported an invalid duration: {duration_seconds}"
        )));
    }

    if let Some(thumbnail_path) = stopped.thumbnail_path.as_ref() {
        let thumbnail_path = PathBuf::from(thumbnail_path);
        if !thumbnail_path.is_file() {
            return Err(RecorderError::InvalidRecordingOutput(format!(
                "thumbnail path does not exist: {}",
                thumbnail_path.display()
            )));
        }
    }

    Ok(RecordingOutputValidation {
        recording_dir: stopped.recording_dir.clone(),
        video_path: stopped.video_path.clone(),
        thumbnail_path: stopped.thumbnail_path.clone(),
        duration_seconds,
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn unique_test_dir(name: &str) -> PathBuf {
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("time went backwards")
            .as_nanos();
        std::env::temp_dir().join(format!("loam-desktop-{name}-{timestamp}"))
    }

    fn sample_recording_dir(name: &str) -> PathBuf {
        let dir = unique_test_dir(name);
        fs::create_dir_all(dir.join("content")).expect("create test recording directory");
        dir
    }

    #[test]
    fn stopped_payload_populates_duration_and_file_size() {
        let recording_dir = sample_recording_dir("payload");
        let video_path = recording_dir.join("content").join("output.mp4");
        fs::write(&video_path, b"video-bytes").expect("write sample video");
        let started_at = SystemTime::now()
            .checked_sub(Duration::from_secs(3))
            .expect("started_at");
        let duration_seconds = SystemTime::now()
            .duration_since(started_at)
            .expect("duration")
            .as_secs_f64();

        let stopped = stopped_payload_from_paths(
            &recording_dir,
            &video_path,
            None,
            Some(duration_seconds),
        )
        .expect("build stop payload");

        assert_eq!(stopped.recording_dir, recording_dir.display().to_string());
        assert_eq!(stopped.video_path, video_path.display().to_string());
        assert_eq!(stopped.file_size_bytes, Some(11));
        assert!(stopped.duration_seconds.unwrap_or_default() > 0.0);

        fs::remove_dir_all(recording_dir).expect("cleanup recording dir");
    }

    #[test]
    fn validate_recording_output_accepts_existing_video_metadata() {
        let recording_dir = sample_recording_dir("validate-ok");
        let video_path = recording_dir.join("content").join("output.mp4");
        fs::write(&video_path, b"123456789").expect("write sample video");

        let stopped = RecordingStopped {
            recording_dir: recording_dir.display().to_string(),
            video_path: video_path.display().to_string(),
            thumbnail_path: None,
            duration_seconds: Some(2.5),
            file_size_bytes: Some(9),
        };

        let validated = validate_recording_output(&stopped).expect("validate output");

        assert_eq!(validated.video_path, stopped.video_path);
        assert_eq!(validated.file_size_bytes, 9);
        assert_eq!(validated.duration_seconds, 2.5);

        fs::remove_dir_all(recording_dir).expect("cleanup recording dir");
    }

    #[test]
    fn validate_recording_output_rejects_missing_duration_or_mismatched_size() {
        let recording_dir = sample_recording_dir("validate-bad");
        let video_path = recording_dir.join("content").join("output.mp4");
        fs::write(&video_path, b"1234").expect("write sample video");

        let missing_duration = RecordingStopped {
            recording_dir: recording_dir.display().to_string(),
            video_path: video_path.display().to_string(),
            thumbnail_path: None,
            duration_seconds: None,
            file_size_bytes: Some(4),
        };

        let mismatched_size = RecordingStopped {
            duration_seconds: Some(1.0),
            file_size_bytes: Some(10),
            ..missing_duration.clone()
        };

        assert!(matches!(
            validate_recording_output(&missing_duration),
            Err(RecorderError::InvalidRecordingOutput(message))
                if message.contains("durationSeconds")
        ));
        assert!(matches!(
            validate_recording_output(&mismatched_size),
            Err(RecorderError::InvalidRecordingOutput(message))
                if message.contains("fileSizeBytes")
        ));

        fs::remove_dir_all(recording_dir).expect("cleanup recording dir");
    }
}
