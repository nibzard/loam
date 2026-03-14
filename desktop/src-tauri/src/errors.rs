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
    #[error("InvalidExternalUrl")]
    InvalidExternalUrl,
    #[error("ExternalOpenFailed/{0}")]
    ExternalOpenFailed(String),
    #[error("UploadAlreadyInProgress")]
    UploadAlreadyInProgress,
    #[error("UploadNotInProgress")]
    UploadNotInProgress,
    #[error("UploadCancelled")]
    UploadCancelled,
    #[error("UploadTooLarge")]
    UploadTooLarge,
    #[error("InvalidRecordingOutput/{0}")]
    InvalidRecordingOutput(String),
    #[error("UploadFailed/{0}")]
    UploadFailed(String),
    #[error("Io/{0}")]
    Io(#[from] std::io::Error),
    #[error("Http/{0}")]
    Http(#[from] reqwest::Error),
    #[error("Recording/{0}")]
    Recording(String),
}

impl RecorderError {
    pub fn into_string(self) -> String {
        self.to_string()
    }
}
