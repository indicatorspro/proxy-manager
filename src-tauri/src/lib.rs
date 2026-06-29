mod commands;
mod services;

use commands::backends::*;
use services::backend_runtime::BackendRuntime;
use std::sync::Arc;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let runtime = Arc::new(BackendRuntime::new());

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState { runtime: runtime.clone() })
        .invoke_handler(tauri::generate_handler![
            list_backends,
            create_backend,
            update_backend,
            delete_backend,
            start_backend,
            stop_backend,
            restart_backend,
            get_backend_logs,
            send_backend_input,
            list_backend_models,
            check_backend_health,
            pick_directory,
            read_env_file,
            write_env_file,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(move |_app_handle, event| {
            if let tauri::RunEvent::ExitRequested { .. } = &event {
                let rt = runtime.clone();
                tauri::async_runtime::block_on(async move {
                    rt.stop_all().await;
                });
            }
        });
}
