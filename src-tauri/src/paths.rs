use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

use crate::error::{AppError, AppResult};

pub struct DataRoot(pub PathBuf);

impl DataRoot {
    pub fn resolve(app: &AppHandle) -> AppResult<Self> {
        let base = app
            .path()
            .app_data_dir()
            .map_err(|e| AppError::Invalid(format!("could not resolve app data dir: {e}")))?;
        Ok(Self(base))
    }

    pub fn schema(&self) -> PathBuf { self.0.join("schema.json") }
    pub fn settings(&self) -> PathBuf { self.0.join("settings.json") }

    pub fn samples_dir(&self) -> PathBuf { self.0.join("samples") }
    pub fn samples_raw(&self) -> PathBuf { self.samples_dir().join("raw") }
    pub fn samples_extracted(&self) -> PathBuf { self.samples_dir().join("extracted") }
    pub fn samples_meta(&self) -> PathBuf { self.samples_dir().join("meta") }

    pub fn voice_dir(&self) -> PathBuf { self.0.join("voice") }
    pub fn voice_profile_md(&self) -> PathBuf { self.voice_dir().join("profile.md") }
    pub fn voice_profile_meta(&self) -> PathBuf { self.voice_dir().join("profile.meta.json") }
    pub fn voice_corrections_md(&self) -> PathBuf { self.voice_dir().join("corrections.md") }
    pub fn voice_corrections_meta(&self) -> PathBuf { self.voice_dir().join("corrections.meta.json") }
    pub fn voice_corrections_dir(&self) -> PathBuf { self.voice_dir().join("corrections") }
    pub fn voice_history(&self) -> PathBuf { self.voice_dir().join(".history") }

    pub fn history_dir(&self) -> PathBuf { self.0.join("history") }

    pub async fn ensure_all(&self) -> AppResult<()> {
        for p in [
            self.0.as_path(),
            &self.samples_raw(),
            &self.samples_extracted(),
            &self.samples_meta(),
            &self.voice_dir(),
            &self.voice_corrections_dir(),
            &self.voice_history(),
            &self.history_dir(),
        ] {
            tokio::fs::create_dir_all(p).await?;
        }

        let schema = self.schema();
        if !schema.exists() {
            let body = serde_json::json!({ "version": 1 });
            tokio::fs::write(&schema, serde_json::to_vec_pretty(&body)?).await?;
        }
        Ok(())
    }
}

pub fn safe_join(base: &Path, child: &str) -> AppResult<PathBuf> {
    if child.contains("..") || child.contains('/') || child.contains('\\') {
        return Err(AppError::Invalid(format!("unsafe path component: {child}")));
    }
    Ok(base.join(child))
}
