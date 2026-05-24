use serde::{Deserialize, Serialize};
use std::path::PathBuf;

use crate::atomic::{write_atomic, write_atomic_string};
use crate::error::{AppError, AppResult};
use crate::paths::{safe_join, DataRoot};

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ViolationRecord {
    pub kind: String,
    pub start: usize,
    pub end: usize,
    pub message: String,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerationMeta {
    pub model: String,
    pub temperature: f64,
    pub finish_reason: String,
    pub ms: u64,
    #[serde(default)]
    pub accepted: bool,
    #[serde(default)]
    pub retried: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ArchiveGenerationInput {
    pub request: String,
    pub source: Option<String>,
    pub system_prompt: String,
    pub draft_v1: String,
    pub violations_v1: Vec<ViolationRecord>,
    pub draft_v2: Option<String>,
    pub violations_v2: Option<Vec<ViolationRecord>>,
    pub final_text: String,
    pub meta: GenerationMeta,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerationSummary {
    pub id: String,
    pub created_at: i64,
    pub request: String,
    pub accepted: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerationFull {
    pub id: String,
    pub created_at: i64,
    pub request: String,
    pub source: Option<String>,
    pub final_text: String,
    pub meta: Option<GenerationMeta>,
}

pub async fn archive(root: &DataRoot, input: ArchiveGenerationInput) -> AppResult<String> {
    let ts = chrono::Utc::now().format("%Y-%m-%dT%H-%M-%SZ").to_string();
    let slug_src = if input.request.is_empty() { "generation" } else { input.request.as_str() };
    let slug: String = slug::slugify(slug_src).chars().take(40).collect();
    let slug = slug.trim_end_matches('-').to_string();
    let dirname = format!("{ts}-{slug}");
    let dir = safe_join(&root.history_dir(), &dirname)?;
    tokio::fs::create_dir_all(&dir).await?;

    write_atomic_string(&dir.join("request.txt"), &input.request).await?;
    if let Some(s) = &input.source {
        if !s.is_empty() {
            write_atomic_string(&dir.join("source.txt"), s).await?;
        }
    }
    write_atomic_string(&dir.join("system-prompt.txt"), &input.system_prompt).await?;
    write_atomic_string(&dir.join("draft-v1.txt"), &input.draft_v1).await?;
    write_atomic(&dir.join("violations-v1.json"), &serde_json::to_vec_pretty(&input.violations_v1)?).await?;
    if let Some(d2) = &input.draft_v2 {
        write_atomic_string(&dir.join("draft-v2.txt"), d2).await?;
    }
    if let Some(v2) = &input.violations_v2 {
        write_atomic(&dir.join("violations-v2.json"), &serde_json::to_vec_pretty(v2)?).await?;
    }
    write_atomic_string(&dir.join("final.txt"), &input.final_text).await?;
    write_atomic(&dir.join("meta.json"), &serde_json::to_vec_pretty(&input.meta)?).await?;
    Ok(dirname)
}

fn parse_dirname_timestamp(name: &str) -> Option<i64> {
    if name.len() < 20 {
        return None;
    }
    let date = &name[0..10];
    let h = &name[11..13];
    let m = &name[14..16];
    let s = &name[17..19];
    let iso = format!("{date}T{h}:{m}:{s}Z");
    chrono::DateTime::parse_from_rfc3339(&iso)
        .ok()
        .map(|dt| dt.timestamp_millis())
}

async fn maybe_read_string(path: PathBuf) -> Option<String> {
    if !path.exists() {
        return None;
    }
    tokio::fs::read_to_string(path).await.ok()
}

pub async fn list(root: &DataRoot) -> AppResult<Vec<GenerationSummary>> {
    let dir = root.history_dir();
    let mut out: Vec<GenerationSummary> = Vec::new();
    if !dir.exists() {
        return Ok(out);
    }
    let mut entries = tokio::fs::read_dir(&dir).await?;
    while let Some(entry) = entries.next_entry().await? {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let name = path
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_string();
        if name.is_empty() {
            continue;
        }
        let created_at = parse_dirname_timestamp(&name).unwrap_or(0);
        let request = maybe_read_string(path.join("request.txt"))
            .await
            .unwrap_or_default();
        let accepted = maybe_read_string(path.join("meta.json"))
            .await
            .and_then(|s| serde_json::from_str::<GenerationMeta>(&s).ok())
            .map(|m| m.accepted)
            .unwrap_or(false);
        out.push(GenerationSummary {
            id: name,
            created_at,
            request,
            accepted,
        });
    }
    out.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    Ok(out)
}

pub async fn read(root: &DataRoot, id: &str) -> AppResult<GenerationFull> {
    let dir = safe_join(&root.history_dir(), id)?;
    if !dir.exists() {
        return Err(AppError::NotFound(format!("generation {id}")));
    }
    let request = maybe_read_string(dir.join("request.txt"))
        .await
        .unwrap_or_default();
    let source = maybe_read_string(dir.join("source.txt")).await;
    let final_text = maybe_read_string(dir.join("final.txt"))
        .await
        .unwrap_or_default();
    let meta = maybe_read_string(dir.join("meta.json"))
        .await
        .and_then(|s| serde_json::from_str::<GenerationMeta>(&s).ok());
    let created_at = parse_dirname_timestamp(id).unwrap_or(0);
    Ok(GenerationFull {
        id: id.to_string(),
        created_at,
        request,
        source,
        final_text,
        meta,
    })
}

pub async fn delete(root: &DataRoot, id: &str) -> AppResult<()> {
    let dir = safe_join(&root.history_dir(), id)?;
    if dir.exists() {
        tokio::fs::remove_dir_all(&dir).await?;
    }
    Ok(())
}
