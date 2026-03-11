use thiserror::Error;

#[derive(Debug, Error)]
pub enum RecorderError {
    #[error("RecordingAlreadyInProgress")]
    RecordingAlreadyInProgress,
    #[error("RecordingNotInProgress")]
    RecordingNotInProgress,
    #[error("RecordingAlreadyPaused")]
    RecordingAlreadyPaused,
    #[error("RecordingNotPaused")]
    RecordingNotPaused,
    #[error("RecorderIsStopping")]
    RecorderIsStopping,
    #[error("TargetNotFound")]
    TargetNotFound,
    #[error("UnsupportedPlatform")]
    UnsupportedPlatform,
    #[error("MicrophoneNotFound")]
    MicrophoneNotFound,
    #[error("MissingScreenPermission")]
    MissingScreenPermission,
    #[error("MissingMicrophonePermission")]
    MissingMicrophonePermission,
    #[error("InvalidCaptureTarget")]
    InvalidCaptureTarget,
    #[error("Io/{0}")]
    Io(#[from] std::io::Error),
    #[error("Recording/{0}")]
    Recording(String),
}

impl RecorderError {
    pub fn into_string(self) -> String {
        self.to_string()
    }
}
