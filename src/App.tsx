import { useState, useEffect, useCallback } from "react";
import { Toaster } from "sonner";
import { Plus, RefreshCw, ListRestart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { ProxyList } from "@/components/proxy-list";
import { LogsViewer } from "@/components/logs-viewer";
import { TerminalInput } from "@/components/terminal-input";
import { ProxyDialog } from "@/components/proxy-dialog";
import { DeleteConfirmDialog } from "@/components/delete-confirm-dialog";
import { useProxies } from "@/hooks/use-proxies";
import { type ManagedBackend, type CreateBackendRequest } from "@/lib/api";

function App() {
  const {
    profiles,
    selectedId,
    setSelectedId,
    selected,
    logs,
    loading,
    busyId,
    liveMode,
    toggleLiveMode,
    refresh,
    runAction,
    sendInput,
    remove,
    create,
    update,
  } = useProxies();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ManagedBackend | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ManagedBackend | null>(null);

  const handleAdd = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  const handleEdit = (profile: ManagedBackend) => {
    setEditing(profile);
    setDialogOpen(true);
  };

  const handleSave = async (req: CreateBackendRequest) => {
    if (editing) {
      return await update(editing.id, req);
    } else {
      return await create(req);
    }
  };

  const handleDelete = (profile: ManagedBackend) => {
    setDeleteTarget(profile);
  };

  const confirmDelete = async () => {
    if (deleteTarget) {
      await remove(deleteTarget.id);
      setDeleteTarget(null);
    }
  };

  const handleStartStop = (profile: ManagedBackend) => {
    const action = profile.status === "running" ? "stop" : "start";
    console.log(`[PROXY-MANAGER] handleStartStop: status=${profile.status} action=${action} id=${profile.id}`);
    runAction(profile, action);
  };

  const handleRestart = (profile: ManagedBackend) => {
    runAction(profile, "restart");
  };

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      if ((e.ctrlKey || e.metaKey) && e.key === "n") {
        e.preventDefault();
        handleAdd();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "r") {
        e.preventDefault();
        void refresh();
      }
      if (e.key === "Escape") {
        if (dialogOpen) setDialogOpen(false);
        if (deleteTarget) setDeleteTarget(null);
      }
    },
    [dialogOpen, deleteTarget, refresh],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-background text-foreground">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-border/50 px-6">
        <div>
          <h1 className="text-base font-semibold">Proxy Manager</h1>
          <p className="text-xs text-muted-foreground">Gerencie seus proxies e backends</p>
        </div>
        <div className="flex items-center gap-1.5">
          <Button variant="ghost" size="sm" onClick={handleAdd} title="Novo Proxy (Ctrl+N)">
            <Plus className="h-4 w-4" />
            <span className="ml-1 hidden sm:inline">Novo Proxy</span>
          </Button>
          <Button variant="ghost" size="sm" onClick={() => refresh()} disabled={loading} title="Refresh (Ctrl+R)">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <ThemeToggle />
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-hidden">
        <div className="flex h-full">
          {/* Coluna 1: Lista de Proxies */}
          <aside className="w-80 shrink-0 border-r border-border/50 overflow-y-auto p-4">
            <div className="mb-4">
              <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground mb-2">
                Proxies
              </h2>
              <p className="text-xs text-muted-foreground">
                {loading
                  ? 'Consultando...'
                  : `${profiles.length} ${profiles.length === 1 ? 'proxy' : 'proxies'}`}
              </p>
            </div>

            {profiles.length === 0 && !loading ? (
              <div className="rounded-lg border border-dashed border-border/70 bg-card/30 py-8 text-center">
                <ListRestart className="mx-auto h-6 w-6 text-muted-foreground/50" />
                <p className="mt-2 text-xs font-medium">Nenhum proxy</p>
                <p className="mt-1 text-[11px] text-muted-foreground">Adicione um para começar.</p>
              </div>
            ) : (
              <ProxyList
                profiles={profiles}
                selectedId={selectedId}
                busyId={busyId}
                loading={loading}
                onSelect={setSelectedId}
                onStartStop={handleStartStop}
                onRestart={handleRestart}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onAdd={handleAdd}
              />
            )}
          </aside>

          {/* Colunas 2-4: Terminal e Logs */}
          <section className="flex-1 flex flex-col min-w-0 overflow-hidden">
            <div className="flex-1 overflow-hidden flex flex-col">
              <LogsViewer
                selected={selected}
                logs={logs}
                liveMode={liveMode}
                onToggleLiveMode={toggleLiveMode}
              />
            </div>
            <div className="shrink-0 border-t border-border/50 p-4">
              <TerminalInput
                selected={selected}
                onSend={async (input) => {
                  if (selected) {
                    await sendInput(selected.id, input);
                  }
                }}
                disabled={busyId === selected?.id}
              />
            </div>
          </section>
        </div>
      </main>

      <ProxyDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editing={editing}
        onSave={handleSave}
      />

      <DeleteConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        target={deleteTarget}
        onConfirm={confirmDelete}
      />

      <Toaster position="top-right" richColors />
    </div>
  );
}

export default App;
