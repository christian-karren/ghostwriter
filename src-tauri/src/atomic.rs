use std::path::Path;
use tokio::io::AsyncWriteExt;

use crate::error::AppResult;

pub async fn write_atomic(path: &Path, bytes: &[u8]) -> AppResult<()> {
    if let Some(parent) = path.parent() {
        tokio::fs::create_dir_all(parent).await?;
    }
    let tmp = path.with_extension(format!(
        "{}.tmp",
        path.extension().and_then(|s| s.to_str()).unwrap_or("part")
    ));
    {
        let mut f = tokio::fs::File::create(&tmp).await?;
        f.write_all(bytes).await?;
        f.flush().await?;
        f.sync_all().await?;
    }
    tokio::fs::rename(&tmp, path).await?;
    Ok(())
}

pub async fn write_atomic_string(path: &Path, content: &str) -> AppResult<()> {
    write_atomic(path, content.as_bytes()).await
}
