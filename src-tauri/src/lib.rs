mod atomic;
mod corrections;
mod error;
mod hash;
mod history;
mod paths;
mod samples;
mod secrets;
mod settings;
mod voice;

use tauri::AppHandle;
use tauri_plugin_opener::OpenerExt;

use crate::error::{AppError, AppResult};
use crate::paths::DataRoot;

async fn root(app: &AppHandle) -> AppResult<DataRoot> {
    let r = DataRoot::resolve(app)?;
    r.ensure_all().await?;
    Ok(r)
}

#[tauri::command]
async fn list_samples(app: AppHandle) -> AppResult<Vec<samples::SampleMeta>> {
    let r = root(&app).await?;
    samples::list(&r).await
}

#[tauri::command]
async fn read_sample(app: AppHandle, id: String) -> AppResult<samples::SamplePayload> {
    let r = root(&app).await?;
    samples::read(&r, &id).await
}

#[tauri::command]
async fn add_sample(app: AppHandle, input: samples::AddSampleInput) -> AppResult<samples::SampleMeta> {
    let r = root(&app).await?;
    samples::add(&r, input).await
}

#[tauri::command]
async fn update_sample(app: AppHandle, id: String, input: samples::UpdateSampleInput) -> AppResult<samples::SampleMeta> {
    let r = root(&app).await?;
    samples::update(&r, &id, input).await
}

#[tauri::command]
async fn delete_sample(app: AppHandle, id: String) -> AppResult<()> {
    let r = root(&app).await?;
    samples::delete(&r, &id).await
}

#[tauri::command]
async fn read_profile(app: AppHandle) -> AppResult<voice::ProfileReadResult> {
    let r = root(&app).await?;
    voice::read_profile(&r).await
}

#[tauri::command]
async fn write_profile(app: AppHandle, input: voice::WriteProfileInput) -> AppResult<()> {
    let r = root(&app).await?;
    voice::write_profile(&r, input).await
}

#[tauri::command]
async fn clear_profile(app: AppHandle) -> AppResult<()> {
    let r = root(&app).await?;
    voice::clear_profile(&r).await
}

#[tauri::command]
async fn read_corrections_digest(app: AppHandle) -> AppResult<voice::DigestReadResult> {
    let r = root(&app).await?;
    voice::read_digest(&r).await
}

#[tauri::command]
async fn write_corrections_digest(app: AppHandle, input: voice::WriteDigestInput) -> AppResult<()> {
    let r = root(&app).await?;
    voice::write_digest(&r, input).await
}

#[tauri::command]
async fn list_corrections(app: AppHandle) -> AppResult<Vec<corrections::Correction>> {
    let r = root(&app).await?;
    corrections::list(&r).await
}

#[tauri::command]
async fn read_correction(app: AppHandle, id: String) -> AppResult<corrections::Correction> {
    let r = root(&app).await?;
    corrections::read(&r, &id).await
}

#[tauri::command]
async fn append_correction(app: AppHandle, correction: corrections::Correction) -> AppResult<corrections::Correction> {
    let r = root(&app).await?;
    corrections::append(&r, correction).await
}

#[tauri::command]
async fn delete_correction(app: AppHandle, id: String) -> AppResult<()> {
    let r = root(&app).await?;
    corrections::delete(&r, &id).await
}

#[tauri::command]
async fn read_settings(app: AppHandle) -> AppResult<settings::Settings> {
    let r = root(&app).await?;
    settings::read(&r).await
}

#[tauri::command]
async fn write_settings(app: AppHandle, settings: settings::Settings) -> AppResult<settings::Settings> {
    let r = root(&app).await?;
    settings::write(&r, settings).await
}

#[tauri::command]
fn get_api_key() -> AppResult<Option<String>> {
    secrets::get_key()
}

#[tauri::command]
fn set_api_key(value: String) -> AppResult<()> {
    secrets::set_key(&value)
}

#[tauri::command]
fn delete_api_key() -> AppResult<()> {
    secrets::delete_key()
}

#[tauri::command]
async fn archive_generation(app: AppHandle, input: history::ArchiveGenerationInput) -> AppResult<String> {
    let r = root(&app).await?;
    history::archive(&r, input).await
}

#[tauri::command]
async fn open_data_dir(app: AppHandle) -> AppResult<()> {
    let r = root(&app).await?;
    let path = r.0.to_string_lossy().to_string();
    app.opener()
        .open_path(path, None::<&str>)
        .map_err(|e| AppError::Invalid(format!("failed to open data dir: {e}")))?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                if let Ok(r) = DataRoot::resolve(&handle) {
                    if let Err(e) = r.ensure_all().await {
                        log::error!("failed to ensure data dir: {e}");
                    } else {
                        log::info!("data dir ready at {}", r.0.display());
                    }
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            list_samples,
            read_sample,
            add_sample,
            update_sample,
            delete_sample,
            read_profile,
            write_profile,
            clear_profile,
            read_corrections_digest,
            write_corrections_digest,
            list_corrections,
            read_correction,
            append_correction,
            delete_correction,
            read_settings,
            write_settings,
            get_api_key,
            set_api_key,
            delete_api_key,
            archive_generation,
            open_data_dir,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
