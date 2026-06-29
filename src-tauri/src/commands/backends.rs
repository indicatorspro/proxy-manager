use crate::services::backend_types::*;
use crate::services::backend_runtime::BackendRuntime;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::State;

pub struct AppState {
    pub runtime: Arc<BackendRuntime>,
}

#[tauri::command]
pub async fn list_backends(state: State<'_, AppState>) -> Result<Vec<ManagedBackend>, String> {
    Ok(state.runtime.list().await)
}

#[tauri::command]
pub async fn create_backend(req: CreateBackendRequest, state: State<'_, AppState>) -> Result<ManagedBackend, String> {
    Ok(state.runtime.create(req).await)
}

#[tauri::command]
pub async fn update_backend(id: String, req: UpdateBackendRequest, state: State<'_, AppState>) -> Result<ManagedBackend, String> {
    state.runtime.update(&id, req).await
}

#[tauri::command]
pub async fn delete_backend(id: String, state: State<'_, AppState>) -> Result<(), String> {
    state.runtime.delete(&id).await
}

#[tauri::command]
pub async fn start_backend(id: String, state: State<'_, AppState>) -> Result<ManagedBackend, String> {
    eprintln!("[PROXY-MANAGER] start_backend COMMAND called for id={id}");
    state.runtime.start(&id).await
}

#[tauri::command]
pub async fn stop_backend(id: String, state: State<'_, AppState>) -> Result<ManagedBackend, String> {
    eprintln!("[PROXY-MANAGER] stop_backend COMMAND called for id={id}");
    state.runtime.stop(&id).await
}

#[tauri::command]
pub async fn restart_backend(id: String, state: State<'_, AppState>) -> Result<ManagedBackend, String> {
    eprintln!("[PROXY-MANAGER] restart_backend COMMAND called for id={id}");
    state.runtime.restart(&id).await
}

#[tauri::command]
pub async fn get_backend_logs(id: String, state: State<'_, AppState>) -> Result<Vec<String>, String> {
    Ok(state.runtime.logs(&id).await)
}

#[tauri::command]
pub async fn send_backend_input(id: String, input: String, state: State<'_, AppState>) -> Result<ManagedBackend, String> {
    state.runtime.send_input(&id, &input).await
}

#[tauri::command]
pub async fn list_backend_models(id: String, state: State<'_, AppState>) -> Result<Vec<String>, String> {
    state.runtime.list_models(&id).await
}

#[tauri::command]
pub async fn check_backend_health(id: String, state: State<'_, AppState>) -> Result<HealthCheckResult, String> {
    state.runtime.check_health(&id).await
}

#[tauri::command]
pub async fn pick_directory(app: tauri::AppHandle) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let result = app.dialog().file().blocking_pick_folder();
    Ok(result.and_then(|p| p.as_path().map(|s| s.to_string_lossy().to_string())))
}

#[tauri::command]
pub async fn read_env_file(working_dir: String) -> Result<EnvFileResult, String> {
    let path = PathBuf::from(&working_dir).join(".env");
    if path.exists() {
        let content = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
        Ok(EnvFileResult {
            path: path.to_string_lossy().to_string(),
            exists: true,
            content,
        })
    } else {
        Ok(EnvFileResult {
            path: path.to_string_lossy().to_string(),
            exists: false,
            content: String::new(),
        })
    }
}

#[tauri::command]
pub async fn write_env_file(working_dir: String, content: String) -> Result<EnvFileResult, String> {
    let path = PathBuf::from(&working_dir).join(".env");
    std::fs::write(&path, &content).map_err(|e| e.to_string())?;
    Ok(EnvFileResult {
        path: path.to_string_lossy().to_string(),
        exists: true,
        content,
    })
}

#[derive(serde::Serialize)]
pub struct EnvFileResult {
    pub path: String,
    pub exists: bool,
    pub content: String,
}

#[derive(serde::Serialize)]
pub struct HealthCheckResult {
    pub ok: bool,
    pub url: String,
    pub status: Option<u16>,
    pub latency_ms: u128,
    pub message: String,
}
