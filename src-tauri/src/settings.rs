use serde::{Deserialize, Serialize};

use crate::atomic::write_atomic;
use crate::error::AppResult;
use crate::paths::DataRoot;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub temperature: f64,
    #[serde(default)]
    pub onboarding_complete: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            temperature: 0.7,
            onboarding_complete: false,
        }
    }
}

pub async fn read(root: &DataRoot) -> AppResult<Settings> {
    let path = root.settings();
    if !path.exists() {
        return Ok(Settings::default());
    }
    let bytes = tokio::fs::read(&path).await?;
    Ok(serde_json::from_slice(&bytes).unwrap_or_default())
}

pub async fn write(root: &DataRoot, s: Settings) -> AppResult<Settings> {
    let path = root.settings();
    write_atomic(&path, &serde_json::to_vec_pretty(&s)?).await?;
    Ok(s)
}
