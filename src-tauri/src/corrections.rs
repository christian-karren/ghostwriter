use serde::{Deserialize, Serialize};
use std::path::PathBuf;

use crate::atomic::write_atomic;
use crate::error::{AppError, AppResult};
use crate::paths::{safe_join, DataRoot};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Correction {
    pub id: String,
    pub created_at: i64,
    pub request: String,
    pub draft: String,
    pub rewrite: String,
    #[serde(default)]
    pub note: String,
    pub lessons: Vec<String>,
}

fn filename_for(c: &Correction) -> String {
    let ts = chrono::DateTime::<chrono::Utc>::from_timestamp_millis(c.created_at)
        .unwrap_or_else(|| chrono::Utc::now())
        .format("%Y-%m-%dT%H-%M-%SZ");
    let short = c.id.chars().take(8).collect::<String>();
    let slug = slug::slugify(if c.request.is_empty() { "correction" } else { c.request.as_str() });
    let trimmed: String = slug.chars().take(40).collect();
    let trimmed = trimmed.trim_end_matches('-');
    format!("{ts}-{trimmed}-{short}.json")
}

async fn find_path_by_id(root: &DataRoot, id: &str) -> AppResult<PathBuf> {
    let dir = root.voice_corrections_dir();
    if !dir.exists() {
        return Err(AppError::NotFound(format!("correction {id}")));
    }
    let mut entries = tokio::fs::read_dir(&dir).await?;
    while let Some(entry) = entries.next_entry().await? {
        let path = entry.path();
        if path.extension().and_then(|s| s.to_str()) != Some("json") {
            continue;
        }
        let bytes = tokio::fs::read(&path).await?;
        let c: Correction = match serde_json::from_slice(&bytes) {
            Ok(x) => x,
            Err(_) => continue,
        };
        if c.id == id {
            return Ok(path);
        }
    }
    Err(AppError::NotFound(format!("correction {id}")))
}

pub async fn list(root: &DataRoot) -> AppResult<Vec<Correction>> {
    let mut out = Vec::new();
    let dir = root.voice_corrections_dir();
    if !dir.exists() {
        return Ok(out);
    }
    let mut entries = tokio::fs::read_dir(&dir).await?;
    while let Some(entry) = entries.next_entry().await? {
        let path = entry.path();
        if path.extension().and_then(|s| s.to_str()) != Some("json") {
            continue;
        }
        let bytes = tokio::fs::read(&path).await?;
        let c: Correction = match serde_json::from_slice(&bytes) {
            Ok(x) => x,
            Err(_) => continue,
        };
        out.push(c);
    }
    out.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    Ok(out)
}

pub async fn read(root: &DataRoot, id: &str) -> AppResult<Correction> {
    let path = find_path_by_id(root, id).await?;
    let bytes = tokio::fs::read(&path).await?;
    Ok(serde_json::from_slice(&bytes)?)
}

pub async fn append(root: &DataRoot, c: Correction) -> AppResult<Correction> {
    let dir = root.voice_corrections_dir();
    tokio::fs::create_dir_all(&dir).await?;
    let name = filename_for(&c);
    let path = safe_join(&dir, &name)?;
    write_atomic(&path, &serde_json::to_vec_pretty(&c)?).await?;
    Ok(c)
}

pub async fn delete(root: &DataRoot, id: &str) -> AppResult<()> {
    let path = find_path_by_id(root, id).await?;
    tokio::fs::remove_file(&path).await.ok();
    Ok(())
}
