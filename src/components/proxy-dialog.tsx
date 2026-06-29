import { useState, useEffect } from "react";
import { toast } from "sonner";
import { backendsApi, type CreateBackendRequest, type ManagedBackend } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FolderOpen } from "lucide-react";

interface ProxyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: ManagedBackend | null;
  onSave: (req: CreateBackendRequest) => Promise<ManagedBackend>;
}

const emptyForm: CreateBackendRequest = {
  name: "",
  kind: "custom",
  start_command: "",
  start_args: null,
  working_dir: null,
  host: "127.0.0.1",
  port: null,
  health_path: "/health",
  api_key: null,
  env_json: null,
  auto_restart: false,
  startup_timeout_ms: 60000,
};

function toForm(p: ManagedBackend): CreateBackendRequest {
  return {
    name: p.name,
    kind: p.kind || "custom",
    start_command: p.start_command,
    start_args: p.start_args ?? null,
    working_dir: p.working_dir ?? null,
    host: p.host || "127.0.0.1",
    port: p.port || null,
    health_path: p.health_path || "/health",
    api_key: p.api_key ?? null,
    env_json: p.env_json ?? null,
    auto_restart: p.auto_restart ?? false,
    startup_timeout_ms: p.startup_timeout_ms || 60000,
  };
}

export function ProxyDialog({ open, onOpenChange, editing, onSave }: ProxyDialogProps) {
  const [form, setForm] = useState<CreateBackendRequest>(emptyForm);
  const [envFileContent, setEnvFileContent] = useState("");
  const [envFilePath, setEnvFilePath] = useState("");
  const [envBusy, setEnvBusy] = useState(false);
  const [startArgsStr, setStartArgsStr] = useState("");
  const [envJsonStr, setEnvJsonStr] = useState("{}");

  useEffect(() => {
    if (editing) {
      setForm(toForm(editing));
      setStartArgsStr(editing.start_args?.join(" ") ?? "");
      setEnvJsonStr(JSON.stringify(editing.env_json ?? {}, null, 2));
    } else {
      setForm(emptyForm);
      setStartArgsStr("");
      setEnvJsonStr("{}");
    }
    setEnvFileContent("");
    setEnvFilePath("");
  }, [editing, open]);

  const pickWorkingDir = async () => {
    try {
      const dir = await backendsApi.pickDirectory();
      if (dir) setForm((c) => ({ ...c, working_dir: dir }));
    } catch {
      toast.error("Could not select folder");
    }
  };

  const loadEnvFile = async () => {
    if (!form.working_dir?.trim()) { toast.error("Working directory is required"); return; }
    try {
      setEnvBusy(true);
      const envFile = await backendsApi.readEnvFile(form.working_dir);
      setEnvFileContent(envFile.content);
      setEnvFilePath(envFile.path);
      toast.success(envFile.exists ? ".env loaded" : ".env not found", { description: envFile.path });
    } catch { toast.error("Could not load .env"); }
    finally { setEnvBusy(false); }
  };

  const saveEnvFile = async () => {
    if (!form.working_dir?.trim()) { toast.error("Working directory is required"); return; }
    try {
      setEnvBusy(true);
      const result = await backendsApi.writeEnvFile(form.working_dir, envFileContent);
      setEnvFilePath(result.path);
      toast.success(".env saved", { description: result.path });
    } catch (error) { toast.error("Could not save .env", { description: error instanceof Error ? error.message : undefined }); }
    finally { setEnvBusy(false); }
  };

  const applyEnvFields = () => {
    const lines = envFileContent.split("\n");
    const vars: Record<string, string> = {};
    for (const line of lines) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq > 0) vars[t.substring(0, eq).trim()] = t.substring(eq + 1).trim();
    }
    setForm((prev) => ({
      ...prev,
      port: vars["PORT"] ? Number(vars["PORT"]) || null : prev.port,
      api_key: vars["API_KEY"] || vars["OPENAI_API_KEY"] || vars["ANTHROPIC_API_KEY"] || prev.api_key,
      health_path: vars["HEALTH_PATH"] || prev.health_path,
    }));
    toast.success("Fields applied from .env");
  };

  const syncEnvFile = async (f: CreateBackendRequest) => {
    if (!f.working_dir?.trim()) return;
    try {
      const existing = await backendsApi.readEnvFile(f.working_dir);
      const lines = existing.content.split("\n");
      const upsert = (key: string, val: string) => {
        const idx = lines.findIndex((l) => l.startsWith(`${key}=`));
        if (val) { if (idx >= 0) lines[idx] = `${key}=${val}`; else lines.push(`${key}=${val}`); }
        else if (idx >= 0) lines.splice(idx, 1);
      };
      upsert("PORT", f.port ? String(f.port) : "");
      upsert("HOST", "0.0.0.0");
      upsert("API_KEY", f.api_key || "");
      await backendsApi.writeEnvFile(f.working_dir, lines.join("\n"));
    } catch { /* best-effort */ }
  };

  const handleSave = async () => {
    try {
      if (!form.name.trim() || !form.start_command.trim()) { toast.error("Name and command are required"); return; }
      const args = startArgsStr.trim() ? startArgsStr.trim().split(/\s+/).filter(Boolean) : null;
      let env: Record<string, string> | null = null;
      const trimmed = envJsonStr.trim();
      if (trimmed) {
        try { env = Object.fromEntries(Object.entries(JSON.parse(trimmed) as Record<string, unknown>).map(([k, v]) => [k, String(v)])); }
        catch { throw new Error("Invalid JSON in environment variables"); }
      }
      const parsedPort = Number(form.port);
      const parsedTimeout = Number(form.startup_timeout_ms);
      const hp = (form.health_path || "").trim();
      const req: CreateBackendRequest = {
        ...form,
        name: form.name.trim(),
        start_command: form.start_command.trim(),
        start_args: args,
        working_dir: form.working_dir?.trim() || null,
        port: form.port ? (Number.isFinite(parsedPort) ? parsedPort : null) : null,
        health_path: hp ? (hp.startsWith("/") ? hp : `/${hp}`) : "",
        api_key: form.api_key?.trim() || null,
        env_json: env,
        startup_timeout_ms: Number.isFinite(parsedTimeout) ? parsedTimeout : 60000,
      };
      await onSave(req);
      await syncEnvFile(req);
      onOpenChange(false);
    } catch (error) { toast.error("Could not save proxy", { description: error instanceof Error ? error.message : undefined }); }
  };

  const set = (field: keyof CreateBackendRequest, value: unknown) => setForm((c) => ({ ...c, [field]: value }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit Proxy" : "Add Proxy"}</DialogTitle>
          <DialogDescription>Configure your proxy backend.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Name *</Label>
              <Input value={form.name} placeholder="My Proxy" className="h-8 text-sm" onChange={(e) => set("name", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Port</Label>
              <Input value={form.port ?? ""} placeholder="3000" inputMode="numeric" className="h-8 text-sm" onChange={(e) => set("port", e.target.value ? Number(e.target.value) : null)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Command *</Label>
            <Input value={form.start_command} placeholder="npm run dev" className="h-8 text-sm font-mono" onChange={(e) => set("start_command", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Start Arguments</Label>
            <Input value={startArgsStr} placeholder="--port 3000" className="h-8 text-sm font-mono" onChange={(e) => setStartArgsStr(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Working Directory</Label>
            <div className="flex gap-2">
              <Input value={form.working_dir ?? ""} placeholder="C:\path\to\proxy" className="flex-1 h-8 text-sm" onChange={(e) => set("working_dir", e.target.value || null)} />
              <Button variant="outline" size="sm" type="button" onClick={pickWorkingDir} className="h-8 px-2"><FolderOpen className="h-4 w-4" /></Button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Health Path</Label>
              <Input value={form.health_path ?? ""} placeholder="/health" className="h-8 text-sm" onChange={(e) => set("health_path", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Startup Timeout (ms)</Label>
              <Input value={form.startup_timeout_ms ?? ""} placeholder="60000" inputMode="numeric" className="h-8 text-sm" onChange={(e) => set("startup_timeout_ms", e.target.value ? Number(e.target.value) : null)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">API Key</Label>
              <Input value={form.api_key ?? ""} type="password" placeholder="Optional" className="h-8 text-sm" onChange={(e) => set("api_key", e.target.value || null)} />
            </div>
            <div className="flex items-end pb-1">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.auto_restart ?? false} onChange={(e) => set("auto_restart", e.target.checked)} className="h-3.5 w-3.5 rounded" />
                <span className="text-xs">Auto-restart</span>
              </label>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Environment Variables (JSON)</Label>
            <Textarea value={envJsonStr} className="min-h-20 font-mono text-xs" onChange={(e) => setEnvJsonStr(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs">.env File</Label>
              {envFilePath && <span className="text-[10px] text-muted-foreground truncate max-w-[200px]">{envFilePath}</span>}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" type="button" disabled={envBusy} onClick={loadEnvFile} className="h-7 text-xs">Load</Button>
              <Button variant="outline" size="sm" type="button" disabled={envBusy || !envFileContent.trim()} onClick={applyEnvFields} className="h-7 text-xs">Apply fields</Button>
              <Button variant="outline" size="sm" type="button" disabled={envBusy || !form.working_dir?.trim()} onClick={saveEnvFile} className="h-7 text-xs">Save</Button>
            </div>
            <Textarea value={envFileContent} placeholder="Load or edit .env content" className="min-h-24 font-mono text-xs" onChange={(e) => setEnvFileContent(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button size="sm" onClick={handleSave}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
