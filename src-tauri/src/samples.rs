use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use uuid::Uuid;

use crate::atomic::{write_atomic, write_atomic_string};
use crate::error::{AppError, AppResult};
use crate::hash::sha256_hex;
use crate::paths::{safe_join, DataRoot};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SampleMeta {
    pub id: String,
    pub short_id: String,
    pub name: String,
    pub kind: String,
    pub raw_path: String,
    pub extracted_path: Option<String>,
    pub content_hash: String,
    pub word_count: usize,
    pub ext: String,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AddSampleInput {
    pub name: String,
    pub kind: String,
    pub bytes: Vec<u8>,
    pub mime_type: Option<String>,
    pub extracted_text: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateSampleInput {
    pub name: Option<String>,
    pub text: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SamplePayload {
    pub meta: SampleMeta,
    pub text: String,
}

fn now_ms() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

fn short_id_from(uuid: Uuid) -> String {
    let bytes = uuid.as_bytes();
    let hex = format!(
        "{:02x}{:02x}{:02x}{:02x}",
        bytes[0], bytes[1], bytes[2], bytes[3]
    );
    hex
}

fn ext_from_mime_or_name(mime: Option<&str>, name: &str) -> String {
    if let Some(m) = mime {
        if m == "application/pdf" {
            return "pdf".to_string();
        }
        if m == "text/markdown" {
            return "md".to_string();
        }
        if m == "text/plain" {
            return "txt".to_string();
        }
    }
    if let Some(dot) = name.rfind('.') {
        let candidate = name[dot + 1..].to_lowercase();
        if !candidate.is_empty() && candidate.len() <= 8 && candidate.chars().all(|c| c.is_ascii_alphanumeric()) {
            return candidate;
        }
    }
    "md".to_string()
}

fn slugify(name: &str) -> String {
    let s = slug::slugify(name);
    if s.is_empty() {
        "sample".to_string()
    } else if s.len() > 60 {
        s.chars().take(60).collect::<String>().trim_end_matches('-').to_string()
    } else {
        s
    }
}

fn word_count(text: &str) -> usize {
    text.split_whitespace().filter(|t| !t.is_empty()).count()
}

fn raw_filename(slug: &str, short_id: &str, ext: &str) -> String {
    format!("{slug}-{short_id}.{ext}")
}

fn extracted_filename(slug: &str, short_id: &str) -> String {
    format!("{slug}-{short_id}.txt")
}

fn meta_filename(slug: &str, short_id: &str) -> String {
    format!("{slug}-{short_id}.json")
}

async fn read_meta_at(path: &Path) -> AppResult<SampleMeta> {
    let bytes = tokio::fs::read(path).await?;
    let meta: SampleMeta = serde_json::from_slice(&bytes)?;
    Ok(meta)
}

async fn find_meta_path_by_id(root: &DataRoot, id: &str) -> AppResult<PathBuf> {
    let mut entries = tokio::fs::read_dir(root.samples_meta()).await?;
    while let Some(entry) = entries.next_entry().await? {
        let path = entry.path();
        if path.extension().and_then(|s| s.to_str()) != Some("json") {
            continue;
        }
        let meta = read_meta_at(&path).await?;
        if meta.id == id {
            return Ok(path);
        }
    }
    Err(AppError::NotFound(format!("sample {id}")))
}

pub async fn list(root: &DataRoot) -> AppResult<Vec<SampleMeta>> {
    let mut metas = Vec::new();
    let dir = root.samples_meta();
    if !dir.exists() {
        return Ok(metas);
    }
    let mut entries = tokio::fs::read_dir(&dir).await?;
    while let Some(entry) = entries.next_entry().await? {
        let path = entry.path();
        if path.extension().and_then(|s| s.to_str()) != Some("json") {
            continue;
        }
        metas.push(read_meta_at(&path).await?);
    }
    metas.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    Ok(metas)
}

pub async fn read(root: &DataRoot, id: &str) -> AppResult<SamplePayload> {
    let meta_path = find_meta_path_by_id(root, id).await?;
    let meta = read_meta_at(&meta_path).await?;
    let text_path = if let Some(ref ep) = meta.extracted_path {
        root.0.join(ep)
    } else {
        root.0.join(&meta.raw_path)
    };
    let text = tokio::fs::read_to_string(&text_path).await?;
    Ok(SamplePayload { meta, text })
}

pub async fn add(root: &DataRoot, input: AddSampleInput) -> AppResult<SampleMeta> {
    let id = Uuid::now_v7();
    let short = short_id_from(id);
    let slug = slugify(&input.name);
    let ext = ext_from_mime_or_name(input.mime_type.as_deref(), &input.name);

    let raw_name = raw_filename(&slug, &short, &ext);
    let raw_rel = format!("samples/raw/{raw_name}");
    let raw_abs = safe_join(&root.samples_raw(), &raw_name)?;

    write_atomic(&raw_abs, &input.bytes).await?;

    let (extracted_rel, canonical_text): (Option<String>, String) = if let Some(text) = input.extracted_text {
        let name = extracted_filename(&slug, &short);
        let abs = safe_join(&root.samples_extracted(), &name)?;
        write_atomic_string(&abs, &text).await?;
        (Some(format!("samples/extracted/{name}")), text)
    } else {
        let as_str = String::from_utf8(input.bytes.clone())
            .map_err(|_| AppError::Invalid("non-utf8 sample bytes require extractedText".into()))?;
        (None, as_str)
    };

    let content_hash = sha256_hex(canonical_text.as_bytes());
    let wc = word_count(&canonical_text);
    let now = now_ms();

    let meta = SampleMeta {
        id: id.to_string(),
        short_id: short.clone(),
        name: input.name,
        kind: input.kind,
        raw_path: raw_rel,
        extracted_path: extracted_rel,
        content_hash,
        word_count: wc,
        ext,
        created_at: now,
        updated_at: now,
    };

    let meta_name = meta_filename(&slug, &short);
    let meta_abs = safe_join(&root.samples_meta(), &meta_name)?;
    write_atomic(&meta_abs, &serde_json::to_vec_pretty(&meta)?).await?;
    Ok(meta)
}

pub async fn update(root: &DataRoot, id: &str, input: UpdateSampleInput) -> AppResult<SampleMeta> {
    let meta_path = find_meta_path_by_id(root, id).await?;
    let mut meta = read_meta_at(&meta_path).await?;

    let new_name = input.name.clone().unwrap_or_else(|| meta.name.clone());
    let new_slug = slugify(&new_name);
    let short = meta.short_id.clone();

    let new_raw_name = raw_filename(&new_slug, &short, &meta.ext);
    let new_raw_rel = format!("samples/raw/{new_raw_name}");
    let new_raw_abs = safe_join(&root.samples_raw(), &new_raw_name)?;
    let old_raw_abs = root.0.join(&meta.raw_path);

    if let Some(text) = input.text {
        if meta.extracted_path.is_some() {
            return Err(AppError::Invalid(
                "cannot edit text of a sample backed by an extracted source (e.g., PDF)".into(),
            ));
        }
        write_atomic(&new_raw_abs, text.as_bytes()).await?;
        if new_raw_abs != old_raw_abs && old_raw_abs.exists() {
            tokio::fs::remove_file(&old_raw_abs).await.ok();
        }
        meta.content_hash = sha256_hex(text.as_bytes());
        meta.word_count = word_count(&text);
        meta.raw_path = new_raw_rel;
    } else if new_raw_abs != old_raw_abs {
        tokio::fs::rename(&old_raw_abs, &new_raw_abs).await?;
        meta.raw_path = new_raw_rel;
    }

    if let Some(ref old_ext_rel) = meta.extracted_path.clone() {
        let new_ext_name = extracted_filename(&new_slug, &short);
        let new_ext_rel = format!("samples/extracted/{new_ext_name}");
        let new_ext_abs = safe_join(&root.samples_extracted(), &new_ext_name)?;
        let old_ext_abs = root.0.join(old_ext_rel);
        if new_ext_abs != old_ext_abs && old_ext_abs.exists() {
            tokio::fs::rename(&old_ext_abs, &new_ext_abs).await?;
            meta.extracted_path = Some(new_ext_rel);
        }
    }

    if let Some(n) = input.name {
        meta.name = n;
    }
    meta.updated_at = now_ms();

    let new_meta_name = meta_filename(&new_slug, &short);
    let new_meta_abs = safe_join(&root.samples_meta(), &new_meta_name)?;
    if new_meta_abs != meta_path && meta_path.exists() {
        tokio::fs::remove_file(&meta_path).await.ok();
    }
    write_atomic(&new_meta_abs, &serde_json::to_vec_pretty(&meta)?).await?;
    Ok(meta)
}

pub async fn delete(root: &DataRoot, id: &str) -> AppResult<()> {
    let meta_path = find_meta_path_by_id(root, id).await?;
    let meta = read_meta_at(&meta_path).await?;
    let raw_abs = root.0.join(&meta.raw_path);
    if raw_abs.exists() {
        tokio::fs::remove_file(&raw_abs).await.ok();
    }
    if let Some(ep) = meta.extracted_path {
        let abs = root.0.join(&ep);
        if abs.exists() {
            tokio::fs::remove_file(&abs).await.ok();
        }
    }
    tokio::fs::remove_file(&meta_path).await.ok();
    Ok(())
}
