import { invoke } from "@tauri-apps/api/core";

export type BackendStatus =
  | "stopped"
  | "starting"
  | "running"
  | "stopping"
  | "error";

export interface ManagedBackend {
  id: string;
  name: string;
  kind: string;
  start_command: string;
  start_args?: string[] | null;
  working_dir?: string | null;
  host: string;
  port: number;
  health_path: string;
  api_key?: string | null;
  env_json?: Record<string, string> | null;
  auto_restart: boolean;
  startup_timeout_ms: number;
  status: BackendStatus;
  pid?: number | null;
  last_error?: string | null;
  created_at: number;
  updated_at: number;
}

export interface CreateBackendRequest {
  name: string;
  kind: string;
  start_command: string;
  start_args?: string[] | null;
  working_dir?: string | null;
  host?: string | null;
  port?: number | null;
  health_path?: string | null;
  api_key?: string | null;
  env_json?: Record<string, string> | null;
  auto_restart?: boolean | null;
  startup_timeout_ms?: number | null;
}

export interface UpdateBackendRequest {
  name?: string | null;
  kind?: string | null;
  start_command?: string | null;
  start_args?: string[] | null;
  working_dir?: string | null;
  host?: string | null;
  port?: number | null;
  health_path?: string | null;
  api_key?: string | null;
  env_json?: Record<string, string> | null;
  auto_restart?: boolean | null;
  startup_timeout_ms?: number | null;
}

export const backendsApi = {
  list(): Promise<ManagedBackend[]> {
    return invoke("list_backends");
  },

  create(req: CreateBackendRequest): Promise<ManagedBackend> {
    return invoke("create_backend", { req });
  },

  update(id: string, req: UpdateBackendRequest): Promise<ManagedBackend> {
    return invoke("update_backend", { id, req });
  },

  delete(id: string): Promise<void> {
    return invoke("delete_backend", { id });
  },

  start(id: string): Promise<ManagedBackend> {
    return invoke("start_backend", { id });
  },

  stop(id: string): Promise<ManagedBackend> {
    return invoke("stop_backend", { id });
  },

  restart(id: string): Promise<ManagedBackend> {
    return invoke("restart_backend", { id });
  },

  logs(id: string): Promise<string[]> {
    return invoke("get_backend_logs", { id });
  },

  sendInput(id: string, input: string): Promise<ManagedBackend> {
    return invoke("send_backend_input", { id, input });
  },

  listModels(id: string): Promise<string[]> {
    return invoke("list_backend_models", { id });
  },

  checkHealth(id: string): Promise<{ ok: boolean; url: string; status: number | null; latency_ms: number; message: string }> {
    return invoke("check_backend_health", { id });
  },

  pickDirectory(): Promise<string | null> {
    return invoke("pick_directory");
  },

  readEnvFile(workingDir: string): Promise<{ path: string; exists: boolean; content: string }> {
    return invoke("read_env_file", { workingDir });
  },

  writeEnvFile(workingDir: string, content: string): Promise<{ path: string; exists: boolean; content: string }> {
    return invoke("write_env_file", { workingDir, content });
  },
};
