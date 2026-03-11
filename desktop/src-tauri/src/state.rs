use tokio::sync::Mutex;
use tokio_util::sync::CancellationToken;

use crate::recorder::NativeRecorderSlot;

pub struct RecorderState {
    pub inner: Mutex<NativeRecorderSlot>,
}

impl Default for RecorderState {
    fn default() -> Self {
        Self {
            inner: Mutex::new(NativeRecorderSlot::Idle),
        }
    }
}

pub struct UploadState {
    pub inner: Mutex<NativeUploadSlot>,
}

impl Default for UploadState {
    fn default() -> Self {
        Self {
            inner: Mutex::new(NativeUploadSlot::Idle),
        }
    }
}

pub enum NativeUploadSlot {
    Idle,
    Active(ActiveUpload),
}

pub struct ActiveUpload {
    pub id: String,
    pub cancel_token: CancellationToken,
}
