use crate::error::AppError;
use crate::sync::models::*;

pub struct SyncClient {
    http: reqwest::Client,
    server_url: String,
    sync_key: String,
}

impl SyncClient {
    pub fn new(server_url: &str, sync_key: &str) -> Self {
        Self {
            http: reqwest::Client::new(),
            server_url: server_url.trim_end_matches('/').to_string(),
            sync_key: sync_key.to_string(),
        }
    }

    pub async fn register(
        &self,
        device_id: &str,
        device_name: &str,
    ) -> Result<RegisterResponse, AppError> {
        let resp = self
            .http
            .post(format!("{}/api/register", self.server_url))
            .json(&RegisterRequest {
                device_id: device_id.to_string(),
                device_name: device_name.to_string(),
                sync_key: self.sync_key.clone(),
            })
            .send()
            .await
            .map_err(|e| AppError::custom(format!("Network error: {e}")))?;

        if !resp.status().is_success() {
            let text = resp.text().await.unwrap_or_default();
            return Err(AppError::custom(format!("Register failed: {text}")));
        }

        resp.json::<RegisterResponse>()
            .await
            .map_err(|e| AppError::custom(format!("Parse error: {e}")))
    }

    pub async fn push_changes(
        &self,
        device_id: &str,
        changes: Vec<ChangeEntry>,
    ) -> Result<PushChangesResponse, AppError> {
        let resp = self
            .http
            .post(format!("{}/api/changes", self.server_url))
            .header("X-Sync-Key", &self.sync_key)
            .json(&PushChangesRequest {
                device_id: device_id.to_string(),
                changes,
            })
            .send()
            .await
            .map_err(|e| AppError::custom(format!("Network error: {e}")))?;

        if !resp.status().is_success() {
            let text = resp.text().await.unwrap_or_default();
            return Err(AppError::custom(format!("Push failed: {text}")));
        }

        resp.json::<PushChangesResponse>()
            .await
            .map_err(|e| AppError::custom(format!("Parse error: {e}")))
    }

    pub async fn pull_changes(&self, since_version: i64) -> Result<PullChangesResponse, AppError> {
        let resp = self
            .http
            .get(format!(
                "{}/api/changes?since_version={since_version}",
                self.server_url
            ))
            .header("X-Sync-Key", &self.sync_key)
            .send()
            .await
            .map_err(|e| AppError::custom(format!("Network error: {e}")))?;

        if !resp.status().is_success() {
            let text = resp.text().await.unwrap_or_default();
            return Err(AppError::custom(format!("Pull failed: {text}")));
        }

        resp.json::<PullChangesResponse>()
            .await
            .map_err(|e| AppError::custom(format!("Parse error: {e}")))
    }

    pub async fn upload_snapshot(
        &self,
        device_id: &str,
        encrypted: String,
        nonce: String,
    ) -> Result<SnapshotResponse, AppError> {
        let resp = self
            .http
            .post(format!("{}/api/snapshot", self.server_url))
            .header("X-Sync-Key", &self.sync_key)
            .json(&SnapshotUploadRequest {
                device_id: device_id.to_string(),
                encrypted,
                nonce,
            })
            .send()
            .await
            .map_err(|e| AppError::custom(format!("Network error: {e}")))?;

        if !resp.status().is_success() {
            let text = resp.text().await.unwrap_or_default();
            return Err(AppError::custom(format!("Snapshot upload failed: {text}")));
        }

        resp.json::<SnapshotResponse>()
            .await
            .map_err(|e| AppError::custom(format!("Parse error: {e}")))
    }

    pub async fn get_latest_snapshot(&self) -> Result<Option<SnapshotResponse>, AppError> {
        let resp = self
            .http
            .get(format!("{}/api/snapshot/latest", self.server_url))
            .header("X-Sync-Key", &self.sync_key)
            .send()
            .await
            .map_err(|e| AppError::custom(format!("Network error: {e}")))?;

        if !resp.status().is_success() {
            let text = resp.text().await.unwrap_or_default();
            return Err(AppError::custom(format!("Snapshot fetch failed: {text}")));
        }

        resp.json::<Option<SnapshotResponse>>()
            .await
            .map_err(|e| AppError::custom(format!("Parse error: {e}")))
    }

    pub async fn get_status(&self) -> Result<StatusResponse, AppError> {
        let resp = self
            .http
            .get(format!("{}/api/status", self.server_url))
            .header("X-Sync-Key", &self.sync_key)
            .send()
            .await
            .map_err(|e| AppError::custom(format!("Network error: {e}")))?;

        if !resp.status().is_success() {
            let text = resp.text().await.unwrap_or_default();
            return Err(AppError::custom(format!("Status fetch failed: {text}")));
        }

        resp.json::<StatusResponse>()
            .await
            .map_err(|e| AppError::custom(format!("Parse error: {e}")))
    }
}
