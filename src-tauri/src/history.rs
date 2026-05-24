use serde::{Deserialize, Serialize};

use crate::atomic::{write_atomic, write_atomic_string};
use crate::error::AppResult;
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
