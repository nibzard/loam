#[cfg(target_os = "macos")]
use std::time::Duration;

#[cfg(target_os = "macos")]
use loam_desktop::{
    permissions,
    recorder::{self, CaptureTarget, StartRecordingInput},
};

#[cfg(target_os = "macos")]
fn parse_duration_seconds() -> Result<u64, String> {
    match std::env::args().nth(1) {
        Some(value) => value
            .parse::<u64>()
            .map_err(|error| format!("invalid duration `{value}`: {error}")),
        None => Ok(3),
    }
}

#[cfg(target_os = "macos")]
fn main() -> Result<(), Box<dyn std::error::Error>> {
    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()?;

    runtime.block_on(async {
        let duration_seconds = parse_duration_seconds()?;
        let permissions = permissions::check_permissions(Some(true));

        println!(
            "starting native smoke recording: screen={:?} microphone={:?} duration={}s",
            permissions.screen, permissions.microphone, duration_seconds
        );

        let display = scap_targets::Display::primary();
        let input = StartRecordingInput {
            target: CaptureTarget::Display {
                id: display.id().to_string(),
                name: "Primary Display".to_string(),
            },
            microphone_name: None,
            capture_system_audio: false,
            countdown_seconds: 0,
        };

        let validated = recorder::run_smoke_recording(input, Duration::from_secs(duration_seconds))
            .await?;

        println!("recordingDir={}", validated.recording_dir);
        println!("videoPath={}", validated.video_path);
        println!("durationSeconds={:.2}", validated.duration_seconds);
        println!("fileSizeBytes={}", validated.file_size_bytes);

        if let Some(thumbnail_path) = validated.thumbnail_path {
            println!("thumbnailPath={thumbnail_path}");
        }

        Ok(())
    })
}

#[cfg(not(target_os = "macos"))]
fn main() {
    eprintln!("recording-smoke is macOS-only");
    std::process::exit(1);
}
