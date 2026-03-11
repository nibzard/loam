use tokio::sync::Mutex;

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
