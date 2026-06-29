use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ManagedBackend {
    pub id: String,
    pub name: String,
    pub kind: String,
    pub start_command: String,
    pub start_args: Option<Vec<String>>,
    pub working_dir: Option<String>,
    pub host: String,
    pub port: u16,
    pub health_path: String,
    pub api_key: Option<String>,
    pub env_json: Option<HashMap<String, String>>,
    pub auto_restart: bool,
    pub startup_timeout_ms: u64,
    pub status: BackendStatus,
    pub pid: Option<u32>,
    pub last_error: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum BackendStatus {
    Stopped,
    Starting,
    Running,
    Stopping,
    Error,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateBackendRequest {
    pub name: String,
    pub kind: String,
    pub start_command: String,
    pub start_args: Option<Vec<String>>,
    pub working_dir: Option<String>,
    pub host: Option<String>,
    pub port: Option<u16>,
    pub health_path: Option<String>,
    pub api_key: Option<String>,
    pub env_json: Option<HashMap<String, String>>,
    pub auto_restart: Option<bool>,
    pub startup_timeout_ms: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateBackendRequest {
    pub name: Option<String>,
    pub kind: Option<String>,
    pub start_command: Option<String>,
    pub start_args: Option<Vec<String>>,
    pub working_dir: Option<String>,
    pub host: Option<String>,
    pub port: Option<u16>,
    pub health_path: Option<String>,
    pub api_key: Option<String>,
    pub env_json: Option<HashMap<String, String>>,
    pub auto_restart: Option<bool>,
    pub startup_timeout_ms: Option<u64>,
}
