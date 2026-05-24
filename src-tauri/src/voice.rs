use serde::{Deserialize, Serialize};
use std::path::PathBuf;

use crate::atomic::{write_atomic, write_atomic_string};
use crate::error::{AppError, AppResult};
use crate::hash::sha256_hex;
use crate::paths::DataRoot;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ProfileMeta {
    pub model: Option<String>,
    pub generated_at: Option<i64>,
    pub source_sample_ids: Vec<String>,
    pub last_machine_hash: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct CorrectionsDigestMeta {
    pub generated_at: Option<i64>,
    pub source_correction_ids: Vec<String>,
    pub last_machine_hash: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileReadResult {
    pub markdown: String,
    pub meta: ProfileMeta,
    pub user_edited: bool,
    pub exists: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DigestReadResult {
    pub markdown: String,
    pub meta: CorrectionsDigestMeta,
    pub user_edited: bool,
    pub exists: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WriteProfileInput {
    pub markdown: String,
    pub meta: ProfileMeta,
    #[serde(default)]
    pub force: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WriteDigestInput {
    pub markdown: String,
    pub meta: CorrectionsDigestMeta,
    #[serde(default)]
    pub force: bool,
}

fn now_ms() -> i64 { chrono::Utc::now().timestamp_millis() }

async fn read_text_or_empty(path: &PathBuf) -> AppResult<(String, bool)> {
    if !path.exists() {
        return Ok((String::new(), false));
    }
    let s = tokio::fs::read_to_string(path).await?;
    Ok((s, true))
}

async fn read_profile_meta(path: &PathBuf) -> AppResult<ProfileMeta> {
    if !path.exists() {
        return Ok(ProfileMeta::default());
    }
    let bytes = tokio::fs::read(path).await?;
    Ok(serde_json::from_slice(&bytes).unwrap_or_default())
}

async fn read_digest_meta(path: &PathBuf) -> AppResult<CorrectionsDigestMeta> {
    if !path.exists() {
        return Ok(CorrectionsDigestMeta::default());
    }
    let bytes = tokio::fs::read(path).await?;
    Ok(serde_json::from_slice(&bytes).unwrap_or_default())
}

async fn snapshot_backup(root: &DataRoot, original: &PathBuf, label: &str) -> AppResult<()> {
    if !original.exists() {
        return Ok(());
    }
    let ts = chrono::Utc::now().format("%Y-%m-%dT%H-%M-%SZ");
    let name = format!("{label}-{ts}.bak");
    let dest = root.voice_history().join(name);
    let bytes = tokio::fs::read(original).await?;
    write_atomic(&dest, &bytes).await?;
    Ok(())
}

pub async fn read_profile(root: &DataRoot) -> AppResult<ProfileReadResult> {
    let md_path = root.voice_profile_md();
    let meta_path = root.voice_profile_meta();
    let (markdown, exists) = read_text_or_empty(&md_path).await?;
    let meta = read_profile_meta(&meta_path).await?;
    let user_edited = if !exists {
        false
    } else {
        match &meta.last_machine_hash {
            Some(h) => sha256_hex(markdown.as_bytes()) != *h,
            None => true,
        }
    };
    Ok(ProfileReadResult { markdown, meta, user_edited, exists })
}

pub async fn write_profile(root: &DataRoot, input: WriteProfileInput) -> AppResult<()> {
    let current = read_profile(root).await?;
    if current.user_edited && !input.force {
        return Err(AppError::UserEdited("voice/profile.md".into()));
    }
    if current.exists {
        snapshot_backup(root, &root.voice_profile_md(), "profile").await?;
    }
    let mut meta = input.meta;
    meta.last_machine_hash = Some(sha256_hex(input.markdown.as_bytes()));
    if meta.generated_at.is_none() {
        meta.generated_at = Some(now_ms());
    }
    write_atomic_string(&root.voice_profile_md(), &input.markdown).await?;
    write_atomic(&root.voice_profile_meta(), &serde_json::to_vec_pretty(&meta)?).await?;
    Ok(())
}

pub async fn clear_profile(root: &DataRoot) -> AppResult<()> {
    let md = root.voice_profile_md();
    let meta = root.voice_profile_meta();
    if md.exists() {
        snapshot_backup(root, &md, "profile").await?;
        tokio::fs::remove_file(&md).await.ok();
    }
    if meta.exists() {
        tokio::fs::remove_file(&meta).await.ok();
    }
    Ok(())
}

pub async fn read_digest(root: &DataRoot) -> AppResult<DigestReadResult> {
    let md_path = root.voice_corrections_md();
    let meta_path = root.voice_corrections_meta();
    let (markdown, exists) = read_text_or_empty(&md_path).await?;
    let meta = read_digest_meta(&meta_path).await?;
    let user_edited = if !exists {
        false
    } else {
        match &meta.last_machine_hash {
            Some(h) => sha256_hex(markdown.as_bytes()) != *h,
            None => true,
        }
    };
    Ok(DigestReadResult { markdown, meta, user_edited, exists })
}

pub async fn write_digest(root: &DataRoot, input: WriteDigestInput) -> AppResult<()> {
    let current = read_digest(root).await?;
    if current.user_edited && !input.force {
        return Err(AppError::UserEdited("voice/corrections.md".into()));
    }
    if current.exists {
        snapshot_backup(root, &root.voice_corrections_md(), "corrections").await?;
    }
    let mut meta = input.meta;
    meta.last_machine_hash = Some(sha256_hex(input.markdown.as_bytes()));
    if meta.generated_at.is_none() {
        meta.generated_at = Some(now_ms());
    }
    write_atomic_string(&root.voice_corrections_md(), &input.markdown).await?;
    write_atomic(&root.voice_corrections_meta(), &serde_json::to_vec_pretty(&meta)?).await?;
    Ok(())
}
