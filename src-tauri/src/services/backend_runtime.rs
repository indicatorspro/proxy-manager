use crate::services::backend_types::*;
use crate::services::job_object::JobObject;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use tokio::process::{Child, Command};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use uuid::Uuid;

struct ManagedChild {
    child: Child,
    #[allow(dead_code)]
    job_object: Option<JobObject>,
}

pub struct BackendRuntime {
    backends: Arc<RwLock<HashMap<String, ManagedBackend>>>,
    children: Arc<RwLock<HashMap<String, ManagedChild>>>,
    logs: Arc<RwLock<HashMap<String, Vec<String>>>>,
    config_path: std::path::PathBuf,
}

impl BackendRuntime {
    pub fn new() -> Self {
        let config_dir = dirs::config_dir()
            .unwrap_or_else(|| std::path::PathBuf::from("."))
            .join("proxy-manager");
        std::fs::create_dir_all(&config_dir).ok();

        let config_path = config_dir.join("backends.json");
        let backends = Self::load_config(&config_path);

        Self {
            backends: Arc::new(RwLock::new(backends)),
            children: Arc::new(RwLock::new(HashMap::new())),
            logs: Arc::new(RwLock::new(HashMap::new())),
            config_path,
        }
    }

    fn load_config(path: &std::path::Path) -> HashMap<String, ManagedBackend> {
        if let Ok(data) = std::fs::read_to_string(path) {
            if let Ok(backends) = serde_json::from_str::<Vec<ManagedBackend>>(&data) {
                return backends
                    .into_iter()
                    .map(|b| (b.id.clone(), b))
                    .collect();
            }
        }
        HashMap::new()
    }

    fn save_config(&self, backends: &HashMap<String, ManagedBackend>) -> Result<(), String> {
        let list: Vec<&ManagedBackend> = backends.values().collect();
        let json = serde_json::to_string_pretty(&list)
            .map_err(|e| format!("Failed to serialize config: {}", e))?;
        std::fs::write(&self.config_path, json)
            .map_err(|e| format!("Failed to write config to {}: {}", self.config_path.display(), e))?;
        Ok(())
    }

    pub async fn list(&self) -> Vec<ManagedBackend> {
        let backends = self.backends.read().await;
        let mut list: Vec<ManagedBackend> = backends.values().cloned().collect();
        list.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
        list
    }

    pub async fn create(&self, req: CreateBackendRequest) -> ManagedBackend {
        let now = chrono::Utc::now().timestamp();
        let backend = ManagedBackend {
            id: Uuid::new_v4().to_string(),
            name: req.name,
            kind: req.kind,
            start_command: req.start_command,
            start_args: req.start_args,
            working_dir: req.working_dir,
            host: req.host.unwrap_or_else(|| "127.0.0.1".to_string()),
            port: req.port.unwrap_or(0),
            health_path: req.health_path.unwrap_or_default(),
            api_key: req.api_key,
            env_json: req.env_json,
            auto_restart: req.auto_restart.unwrap_or(false),
            startup_timeout_ms: req.startup_timeout_ms.unwrap_or(60000),
            status: BackendStatus::Stopped,
            pid: None,
            last_error: None,
            created_at: now,
            updated_at: now,
        };

        let mut backends = self.backends.write().await;
        backends.insert(backend.id.clone(), backend.clone());
        let _ = self.save_config(&backends);
        backend
    }

    pub async fn update(&self, id: &str, req: UpdateBackendRequest) -> Result<ManagedBackend, String> {
        let mut backends = self.backends.write().await;
        let backend = backends.get_mut(id).ok_or("Backend not found")?;

        if let Some(name) = req.name { backend.name = name; }
        if let Some(kind) = req.kind { backend.kind = kind; }
        if let Some(cmd) = req.start_command { backend.start_command = cmd; }
        if let Some(args) = req.start_args { backend.start_args = Some(args); }
        if let Some(dir) = req.working_dir { backend.working_dir = Some(dir); }
        if let Some(host) = req.host { backend.host = host; }
        if let Some(port) = req.port { backend.port = port; }
        if let Some(path) = req.health_path { backend.health_path = path; }
        if let Some(key) = req.api_key { backend.api_key = Some(key); }
        if let Some(env) = req.env_json { backend.env_json = Some(env); }
        if let Some(restart) = req.auto_restart { backend.auto_restart = restart; }
        if let Some(timeout) = req.startup_timeout_ms { backend.startup_timeout_ms = timeout; }

        backend.updated_at = chrono::Utc::now().timestamp();
        let result = backend.clone();
        self.save_config(&backends)?;
        Ok(result)
    }

    pub async fn delete(&self, id: &str) -> Result<(), String> {
        self.stop(id).await.ok();
        let mut backends = self.backends.write().await;
        backends.remove(id).ok_or("Backend not found")?;
        self.save_config(&backends)?;
        Ok(())
    }

    pub async fn start(&self, id: &str) -> Result<ManagedBackend, String> {
        let (backend_id, command, start_args, working_dir, env_json, host, port, health_path, api_key, startup_timeout_ms, _auto_restart) = {
            let backends = self.backends.read().await;
            let backend = backends.get(id).ok_or("Backend not found")?;
            (
                backend.id.clone(),
                backend.start_command.clone(),
                backend.start_args.clone(),
                backend.working_dir.clone(),
                backend.env_json.clone().unwrap_or_default(),
                backend.host.clone(),
                backend.port,
                backend.health_path.clone(),
                backend.api_key.clone(),
                backend.startup_timeout_ms,
                backend.auto_restart,
            )
        };

        #[cfg(target_os = "windows")]
        let (shell, shell_flag) = ("cmd.exe", "/C");

        #[cfg(not(target_os = "windows"))]
        let (shell, shell_flag) = ("sh", "-c");

        let mut cmd = if start_args.as_ref().map(|a| !a.is_empty()).unwrap_or(false) {
            match std::fs::canonicalize(&command) {
                Ok(resolved) => {
                    let mut cmd = Command::new(&resolved);
                    if let Some(args) = &start_args {
                        cmd.args(args);
                    }
                    #[cfg(target_os = "windows")]
                    {
                        use std::os::windows::process::CommandExt;
                        const CREATE_NO_WINDOW: u32 = 0x08000000;
                        cmd.creation_flags(CREATE_NO_WINDOW);
                    }
                    cmd
                }
                Err(_) => {
                    let mut cmd = Command::new(shell);
                    cmd.arg(shell_flag).arg(&command);
                    #[cfg(target_os = "windows")]
                    {
                        use std::os::windows::process::CommandExt;
                        const CREATE_NO_WINDOW: u32 = 0x08000000;
                        cmd.creation_flags(CREATE_NO_WINDOW);
                    }
                    cmd
                }
            }
        } else {
            let mut cmd = Command::new(shell);
            cmd.arg(shell_flag).arg(&command);
            #[cfg(target_os = "windows")]
            {
                use std::os::windows::process::CommandExt;
                const CREATE_NO_WINDOW: u32 = 0x08000000;
                cmd.creation_flags(CREATE_NO_WINDOW);
            }
            cmd
        };

        if let Some(dir) = &working_dir {
            let resolved_wd = std::fs::canonicalize(dir)
                .unwrap_or_else(|_| std::path::PathBuf::from(dir));
            cmd.current_dir(&resolved_wd);
        }

        for (key, value) in &env_json {
            cmd.env(key, value);
        }

        if port > 0 {
            cmd.env("PORT", port.to_string());
        }
        if !host.trim().is_empty() {
            cmd.env("HOST", &host);
        }
        if let Some(key) = api_key.as_deref().filter(|value| !value.is_empty()) {
            cmd.env("API_KEY", key);
            cmd.env("OPENAI_API_KEY", key);
            cmd.env("ANTHROPIC_API_KEY", key);
        }

        cmd.stdout(std::process::Stdio::piped());
        cmd.stderr(std::process::Stdio::piped());
        cmd.stdin(std::process::Stdio::piped());

        let mut job_object = None;

        #[cfg(target_os = "windows")]
        {
            match JobObject::new() {
                Ok(job) => {
                    job_object = Some(job);
                }
                Err(e) => {
                    eprintln!("[PROXY-MANAGER] Failed to create Job Object: {}", e);
                }
            }
        }

        #[cfg(target_os = "unix")]
        {
            use std::os::unix::process::CommandExt;
            cmd.process_group(0);
        }

        let mut child = cmd.spawn().map_err(|e| format!("Failed to spawn process: {e}"))?;
        let pid = child.id();
        eprintln!("[PROXY-MANAGER] start() spawned pid={pid:?} id={backend_id} command={command}");

        #[cfg(target_os = "windows")]
        if let Some(ref job) = job_object {
            if let Some(handle) = child.raw_handle() {
                if let Err(e) = job.assign_process(handle as isize) {
                    eprintln!("[PROXY-MANAGER] Failed to assign process to Job Object: {}", e);
                }
            }
        }

        let stdout_notify = Arc::new(tokio::sync::Notify::new());
        let stderr_notify = Arc::new(tokio::sync::Notify::new());

        if let Some(stdout) = child.stdout.take() {
            let id_clone = backend_id.clone();
            let logs = self.logs.clone();
            let notify = stdout_notify.clone();
            tokio::spawn(async move {
                let mut stream = stdout;
                let mut buffer = [0_u8; 1024];
                loop {
                    match stream.read(&mut buffer).await {
                        Ok(0) => break,
                        Ok(n) => {
                            let text = String::from_utf8_lossy(&buffer[..n])
                                .replace("\r\n", "\n")
                                .replace('\r', "\n");
                            if text.is_empty() {
                                continue;
                            }
                            let mut map = logs.write().await;
                            if let Some(logs_vec) = map.get_mut(&id_clone) {
                                for line in text.lines() {
                                    logs_vec.push(line.to_string());
                                }
                                if logs_vec.len() > 2000 {
                                    let drain_count = logs_vec.len() - 2000;
                                    logs_vec.drain(..drain_count);
                                }
                            }
                        }
                        Err(_) => break,
                    }
                }
                notify.notify_one();
            });
        }

        if let Some(stderr) = child.stderr.take() {
            let id_clone = backend_id.clone();
            let logs = self.logs.clone();
            let notify = stderr_notify.clone();
            tokio::spawn(async move {
                let mut stream = stderr;
                let mut buffer = [0_u8; 1024];
                loop {
                    match stream.read(&mut buffer).await {
                        Ok(0) => break,
                        Ok(n) => {
                            let text = String::from_utf8_lossy(&buffer[..n])
                                .replace("\r\n", "\n")
                                .replace('\r', "\n");
                            if text.is_empty() {
                                continue;
                            }
                            let mut map = logs.write().await;
                            if let Some(logs_vec) = map.get_mut(&id_clone) {
                                for line in text.lines() {
                                    logs_vec.push(format!("[stderr] {}", line));
                                }
                                if logs_vec.len() > 2000 {
                                    let drain_count = logs_vec.len() - 2000;
                                    logs_vec.drain(..drain_count);
                                }
                            }
                        }
                        Err(_) => break,
                    }
                }
                notify.notify_one();
            });
        }

        let mut children = self.children.write().await;
        children.insert(backend_id.clone(), ManagedChild { child, job_object });

        let mut backends = self.backends.write().await;
        if let Some(backend) = backends.get_mut(&backend_id) {
            backend.status = BackendStatus::Running;
            backend.pid = pid;
            backend.last_error = None;
            backend.updated_at = chrono::Utc::now().timestamp();
        }

        let mut logs = self.logs.write().await;
        logs.entry(backend_id.clone())
            .or_default()
            .push(format!("[{}] Started (pid: {})", chrono::Utc::now().format("%H:%M:%S"), pid.unwrap_or(0)));

        let result = backends.get(&backend_id).cloned().unwrap();
        self.save_config(&backends)?;

        let runtime_ref = self.clone_refs();
        let backend_id_clone = backend_id.clone();
        tokio::spawn(async move {
            Self::watch_process(runtime_ref, &backend_id_clone, stdout_notify, stderr_notify).await;
        });

        if port > 0 && !health_path.trim().is_empty() {
            let runtime_ref = self.clone_refs();
            let backend_id_clone = backend_id.clone();
            let health_url = if health_path.starts_with('/') {
                format!("http://{host}:{port}{health_path}")
            } else {
                format!("http://{host}:{port}/{health_path}")
            };
            tokio::spawn(async move {
                Self::wait_for_health(runtime_ref, &backend_id_clone, &health_url, startup_timeout_ms).await;
            });
        }

        Ok(result)
    }

    pub async fn stop(&self, id: &str) -> Result<ManagedBackend, String> {
        eprintln!("[PROXY-MANAGER] stop() called for id={id}");
        let managed_child = {
            let mut children = self.children.write().await;
            let found = children.contains_key(id);
            eprintln!("[PROXY-MANAGER] stop() child in map: {found}");
            children.remove(id)
        };

        if let Some(managed) = managed_child {
            let mut child = managed.child;
            eprintln!("[PROXY-MANAGER] stop() killing child pid={:?}", child.id());

            // No Unix, kill the entire process group
            #[cfg(target_os = "unix")]
            if let Some(pid) = child.id() {
                unsafe {
                    libc::killpg(pid as i32, libc::SIGTERM);
                }
                // Give it a moment to terminate gracefully
                tokio::time::sleep(std::time::Duration::from_millis(100)).await;
            }

            let kill_result = child.kill().await;
            eprintln!("[PROXY-MANAGER] stop() kill result: {:?}", kill_result);
            let wait_result = child.wait().await;
            eprintln!("[PROXY-MANAGER] stop() wait result: {:?}", wait_result);

            // Job object will be dropped here, which closes the handle and kills all processes in the job
            drop(managed.job_object);
        } else {
            eprintln!("[PROXY-MANAGER] stop() NO child found in map");
        }

        let mut backends = self.backends.write().await;
        if let Some(backend) = backends.get_mut(id) {
            backend.status = BackendStatus::Stopped;
            backend.pid = None;
            backend.last_error = None;
            backend.updated_at = chrono::Utc::now().timestamp();
        }

        let mut logs = self.logs.write().await;
        logs.entry(id.to_string())
            .or_default()
            .push(format!("[{}] Stopped", chrono::Utc::now().format("%H:%M:%S")));

        let result = backends.get(id).cloned().unwrap();
        self.save_config(&backends)?;
        Ok(result)
    }

    pub async fn restart(&self, id: &str) -> Result<ManagedBackend, String> {
        self.stop(id).await.ok();
        tokio::time::sleep(std::time::Duration::from_millis(500)).await;
        self.start(id).await
    }

    pub async fn logs(&self, id: &str) -> Vec<String> {
        let logs = self.logs.read().await;
        logs.get(id).cloned().unwrap_or_default()
    }

    pub async fn send_input(&self, id: &str, input: &str) -> Result<ManagedBackend, String> {
        let mut children = self.children.write().await;
        if let Some(managed) = children.get_mut(id) {
            if let Some(stdin) = managed.child.stdin.as_mut() {
                stdin.write_all(input.as_bytes()).await.map_err(|e| e.to_string())?;
                if !input.ends_with('\n') && !input.ends_with('\r') {
                    #[cfg(target_os = "windows")]
                    stdin.write_all(b"\r\n").await.map_err(|e| e.to_string())?;
                    #[cfg(not(target_os = "windows"))]
                    stdin.write_all(b"\n").await.map_err(|e| e.to_string())?;
                }
                stdin.flush().await.map_err(|e| e.to_string())?;
            }
        }

        let mut logs = self.logs.write().await;
        logs.entry(id.to_string())
            .or_default()
            .push(format!("[{}] > {}", chrono::Utc::now().format("%H:%M:%S"), input));

        let backends = self.backends.read().await;
        backends.get(id).cloned().ok_or("Backend not found".to_string())
    }

    pub async fn list_models(&self, id: &str) -> Result<Vec<String>, String> {
        let (host, port, api_key) = {
            let backends = self.backends.read().await;
            let backend = backends.get(id).ok_or("Backend not found")?;
            (backend.host.clone(), backend.port, backend.api_key.clone())
        };

        if port == 0 {
            return Err("Port is required to list models".to_string());
        }

        let url = format!("http://{host}:{port}/v1/models");
        let client = reqwest::Client::new();
        let mut request = client.get(&url);
        if let Some(key) = api_key.as_deref().filter(|value| !value.is_empty()) {
            request = request.bearer_auth(key);
        }

        let response = request.send().await.map_err(|e| format!("Failed to list models: {e}"))?;
        let status = response.status();
        let body = response.text().await.map_err(|e| format!("Failed to read response: {e}"))?;

        if !status.is_success() {
            let truncated = if body.len() > 240 { &body[..240] } else { &body };
            return Err(format!("Models request failed ({status}): {truncated}"));
        }

        let value: serde_json::Value = serde_json::from_str(&body)
            .map_err(|e| format!("Invalid models JSON: {e}"))?;

        let source = value.get("data")
            .and_then(|data| data.as_array())
            .or_else(|| value.as_array());

        let mut models: Vec<String> = source
            .into_iter()
            .flatten()
            .filter_map(|item| {
                item.get("id")
                    .and_then(|id| id.as_str())
                    .or_else(|| item.as_str())
                    .map(str::to_string)
            })
            .collect();

        models.sort();
        models.dedup();
        Ok(models)
    }

    pub async fn check_health(&self, id: &str) -> Result<crate::commands::backends::HealthCheckResult, String> {
        let (host, port, health_path, api_key) = {
            let backends = self.backends.read().await;
            let backend = backends.get(id).ok_or("Backend not found")?;
            (backend.host.clone(), backend.port, backend.health_path.clone(), backend.api_key.clone())
        };

        if port == 0 {
            return Err("Port is required for health check".to_string());
        }

        let path = if health_path.trim().is_empty() {
            "/".to_string()
        } else if health_path.starts_with('/') {
            health_path
        } else {
            format!("/{health_path}")
        };

        let url = format!("http://{host}:{port}{path}");
        let start = std::time::Instant::now();

        let client = reqwest::Client::new();
        let mut request = client.get(&url);
        if let Some(key) = api_key.as_deref().filter(|value| !value.is_empty()) {
            request = request.bearer_auth(key);
        }

        match request.send().await {
            Ok(response) => {
                let status = response.status().as_u16();
                let latency = start.elapsed().as_millis();
                let ok = response.status().is_success();
                let message = if ok {
                    format!("Health check OK ({status})")
                } else {
                    format!("Health check failed ({status})")
                };
                Ok(crate::commands::backends::HealthCheckResult {
                    ok, url, status: Some(status), latency_ms: latency, message,
                })
            }
            Err(err) => {
                let latency = start.elapsed().as_millis();
                Ok(crate::commands::backends::HealthCheckResult {
                    ok: false, url, status: None, latency_ms: latency,
                    message: format!("Connection failed: {err}"),
                })
            }
        }
    }

    fn clone_refs(&self) -> Self {
        Self {
            backends: self.backends.clone(),
            children: self.children.clone(),
            logs: self.logs.clone(),
            config_path: self.config_path.clone(),
        }
    }

    async fn watch_process(
        runtime: Self,
        backend_id: &str,
        stdout_notify: Arc<tokio::sync::Notify>,
        stderr_notify: Arc<tokio::sync::Notify>,
    ) {
        eprintln!("[PROXY-MANAGER] watch_process STARTED for id={backend_id}");
        loop {
            tokio::select! {
                _ = stdout_notify.notified() => {
                    eprintln!("[PROXY-MANAGER] watch_process stdout EOF for id={backend_id}");
                    break;
                }
                _ = stderr_notify.notified() => {
                    eprintln!("[PROXY-MANAGER] watch_process stderr EOF for id={backend_id}");
                    break;
                }
                _ = tokio::time::sleep(std::time::Duration::from_millis(500)) => {
                    let exited = {
                        let mut children = runtime.children.write().await;
                        match children.get_mut(backend_id) {
                            Some(managed) => match managed.child.try_wait() {
                                Ok(Some(status)) => {
                                    eprintln!("[PROXY-MANAGER] watch_process try_wait=Some({status})");
                                    children.remove(backend_id);
                                    Some(status)
                                }
                                Ok(None) => None,
                                Err(err) => {
                                    eprintln!("[PROXY-MANAGER] watch_process try_wait=Err({err})");
                                    children.remove(backend_id);
                                    None
                                }
                            },
                            None => {
                                eprintln!("[PROXY-MANAGER] watch_process child NOT FOUND, breaking");
                                break;
                            }
                        }
                    };
                    if exited.is_some() {
                        break;
                    }
                }
            }
        }

        let mut children = runtime.children.write().await;
        children.remove(backend_id);

        let mut backends = runtime.backends.write().await;
        if let Some(backend) = backends.get_mut(backend_id) {
            backend.pid = None;
            backend.updated_at = chrono::Utc::now().timestamp();
            backend.status = BackendStatus::Stopped;
            backend.last_error = None;
        }
        let mut logs = runtime.logs.write().await;
        if let Some(logs_vec) = logs.get_mut(backend_id) {
            logs_vec.push(format!("[{}] Process exited", chrono::Utc::now().format("%H:%M:%S")));
        }
        let _ = runtime.save_config(&backends);
    }

    async fn wait_for_health(
        runtime: Self,
        backend_id: &str,
        health_url: &str,
        startup_timeout_ms: u64,
    ) {
        let start = std::time::Instant::now();

        while start.elapsed().as_millis() < startup_timeout_ms as u128 {
            {
                let children = runtime.children.read().await;
                if !children.contains_key(backend_id) {
                    return;
                }
            }

            if let Ok(resp) = reqwest::get(health_url).await {
                if resp.status().is_success() {
                    let mut backends = runtime.backends.write().await;
                    if let Some(backend) = backends.get_mut(backend_id) {
                        backend.status = BackendStatus::Running;
                        backend.updated_at = chrono::Utc::now().timestamp();
                    }
                    let mut logs = runtime.logs.write().await;
                    if let Some(logs_vec) = logs.get_mut(backend_id) {
                        logs_vec.push(format!("[{}] Health check OK", chrono::Utc::now().format("%H:%M:%S")));
                    }
                    let _ = runtime.save_config(&backends);
                    return;
                }
            }
            tokio::time::sleep(std::time::Duration::from_millis(500)).await;
        }

        let mut backends = runtime.backends.write().await;
        let mut logs = runtime.logs.write().await;

        // Only set Error status if the process is actually dead
        let process_alive = {
            let children = runtime.children.read().await;
            children.contains_key(backend_id)
        };

        if process_alive {
            if let Some(logs_vec) = logs.get_mut(backend_id) {
                logs_vec.push(format!("[{}] Health check timeout (process still running)", chrono::Utc::now().format("%H:%M:%S")));
            }
        } else {
            if let Some(backend) = backends.get_mut(backend_id) {
                backend.status = BackendStatus::Error;
                backend.last_error = Some("Health check timeout".to_string());
                backend.updated_at = chrono::Utc::now().timestamp();
            }
            if let Some(logs_vec) = logs.get_mut(backend_id) {
                logs_vec.push(format!("[{}] Health check timeout", chrono::Utc::now().format("%H:%M:%S")));
            }
        }
        let _ = runtime.save_config(&backends);
    }

    pub async fn stop_all(&self) {
        let managed_children: Vec<ManagedChild> = {
            let mut map = self.children.write().await;
            map.drain().map(|(_, managed)| managed).collect()
        };

        for mut managed in managed_children {
            let _ = managed.child.kill().await;
            let _ = managed.child.wait().await;
            // Job object will be dropped here, killing all processes in the job
            drop(managed.job_object);
        }

        let mut backends = self.backends.write().await;
        for backend in backends.values_mut() {
            if backend.status == BackendStatus::Running || backend.status == BackendStatus::Starting {
                backend.status = BackendStatus::Stopped;
                backend.pid = None;
                backend.updated_at = chrono::Utc::now().timestamp();
            }
        }
        let _ = self.save_config(&backends);
    }
}
