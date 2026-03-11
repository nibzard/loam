use std::{
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc,
    },
};

use async_stream::try_stream;
use bytes::Bytes;
use futures_util::TryStreamExt;
use reqwest::{
    header::{CONTENT_LENGTH, CONTENT_TYPE},
    Client, StatusCode,
};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, State};
use tokio::{
    fs::File,
    io::{AsyncReadExt, BufReader},
};
use tokio_util::sync::CancellationToken;

use crate::{
    errors::RecorderError,
    state::{ActiveUpload, NativeUploadSlot, UploadState},
};

pub const UPLOAD_PROGRESS_EVENT: &str = "upload-progress";
const UPLOAD_CHUNK_SIZE: usize = 1024 * 1024;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UploadFileInput {
    pub upload_url: String,
    pub video_path: String,
    pub content_type: String,
    pub upload_id: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UploadProgressEvent {
    pub upload_id: String,
    pub video_path: String,
    pub bytes_sent: u64,
    pub total_bytes: u64,
    pub fraction_completed: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UploadCompleted {
    pub upload_id: String,
    pub video_path: String,
    pub total_bytes: u64,
    pub status_code: u16,
}

#[tauri::command(async)]
pub async fn upload_file(
    app: AppHandle,
    state: State<'_, UploadState>,
    input: UploadFileInput,
) -> Result<UploadCompleted, String> {
    let video_path = PathBuf::from(&input.video_path);
    let file_name = file_stem_or_name(&video_path);
    let upload_id = input
        .upload_id
        .clone()
        .unwrap_or_else(|| format!("upload:{file_name}"));
    let cancel_token = CancellationToken::new();

    {
        let mut guard = state.inner.lock().await;
        match &*guard {
            NativeUploadSlot::Idle => {
                *guard = NativeUploadSlot::Active(ActiveUpload {
                    id: upload_id.clone(),
                    cancel_token: cancel_token.clone(),
                });
            }
            NativeUploadSlot::Active(_) => {
                return Err(RecorderError::UploadAlreadyInProgress.into_string());
            }
        }
    }

    let upload_result = perform_upload(
        app,
        cancel_token,
        upload_id.clone(),
        video_path,
        input.upload_url,
        input.content_type,
    )
    .await;

    let mut guard = state.inner.lock().await;
    let should_clear = matches!(&*guard, NativeUploadSlot::Active(active) if active.id == upload_id);
    if should_clear {
        *guard = NativeUploadSlot::Idle;
    }

    upload_result.map_err(RecorderError::into_string)
}

#[tauri::command(async)]
pub async fn cancel_upload(
    state: State<'_, UploadState>,
    upload_id: Option<String>,
) -> Result<(), String> {
    let guard = state.inner.lock().await;

    match &*guard {
        NativeUploadSlot::Idle => Err(RecorderError::UploadNotInProgress.into_string()),
        NativeUploadSlot::Active(active) => {
            if upload_id.as_ref().is_some_and(|requested| requested != &active.id) {
                return Err(RecorderError::UploadNotInProgress.into_string());
            }

            active.cancel_token.cancel();
            Ok(())
        }
    }
}

async fn perform_upload(
    app: AppHandle,
    cancel_token: CancellationToken,
    upload_id: String,
    video_path: PathBuf,
    upload_url: String,
    content_type: String,
) -> Result<UploadCompleted, RecorderError> {
    let file = File::open(&video_path).await?;
    let total_bytes = file.metadata().await?.len();
    let reader = BufReader::new(file);
    let bytes_sent = Arc::new(AtomicU64::new(0));
    let body_stream = build_upload_stream(
        app.clone(),
        cancel_token.clone(),
        upload_id.clone(),
        video_path.clone(),
        reader,
        total_bytes,
        Arc::clone(&bytes_sent),
    );

    let client = Client::new();
    let request = client
        .put(upload_url)
        .header(CONTENT_TYPE, content_type)
        .header(CONTENT_LENGTH, total_bytes.to_string())
        .body(reqwest::Body::wrap_stream(body_stream));

    let response = tokio::select! {
        response = request.send() => match response {
            Ok(response) => response,
            Err(error) if cancel_token.is_cancelled() => return Err(RecorderError::UploadCancelled),
            Err(error) => return Err(RecorderError::Http(error)),
        },
        _ = cancel_token.cancelled() => return Err(RecorderError::UploadCancelled),
    };

    if !response.status().is_success() {
        return Err(upload_failed(response.status()));
    }

    Ok(UploadCompleted {
        upload_id,
        video_path: video_path.display().to_string(),
        total_bytes,
        status_code: response.status().as_u16(),
    })
}

fn build_upload_stream(
    app: AppHandle,
    cancel_token: CancellationToken,
    upload_id: String,
    video_path: PathBuf,
    mut reader: BufReader<File>,
    total_bytes: u64,
    bytes_sent: Arc<AtomicU64>,
) -> impl futures_util::Stream<Item = Result<Bytes, RecorderError>> + Send + 'static {
    try_stream! {
        let mut buffer = vec![0_u8; UPLOAD_CHUNK_SIZE];

        loop {
            if cancel_token.is_cancelled() {
                Err(RecorderError::UploadCancelled)?;
            }

            let read = reader.read(&mut buffer).await?;
            if read == 0 {
                break;
            }

            let chunk = Bytes::copy_from_slice(&buffer[..read]);
            let uploaded = bytes_sent.fetch_add(read as u64, Ordering::Relaxed) + read as u64;

            emit_upload_progress(
                &app,
                UploadProgressEvent {
                    upload_id: upload_id.clone(),
                    video_path: video_path.display().to_string(),
                    bytes_sent: uploaded,
                    total_bytes,
                    fraction_completed: if total_bytes == 0 {
                        1.0
                    } else {
                        uploaded as f64 / total_bytes as f64
                    },
                },
            );

            yield chunk;
        }
    }
    .map_err(|error| match error {
        RecorderError::UploadCancelled => error,
        other => RecorderError::UploadFailed(other.to_string()),
    })
}

fn emit_upload_progress(app: &AppHandle, event: UploadProgressEvent) {
    let _ = app.emit(UPLOAD_PROGRESS_EVENT, event);
}

fn file_stem_or_name(path: &Path) -> String {
    path.file_stem()
        .or_else(|| path.file_name())
        .and_then(|value| value.to_str())
        .map(ToOwned::to_owned)
        .unwrap_or_else(|| "video".to_string())
}

fn upload_failed(status: StatusCode) -> RecorderError {
    RecorderError::UploadFailed(format!("HTTP {}", status.as_u16()))
}
