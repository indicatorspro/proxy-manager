import { useState, useEffect } from "react";
import { Play, Square, RotateCw, Edit, Trash2, Loader2, Clock, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { ManagedBackend } from "@/lib/api";

interface ProxyCardProps {
  profile: ManagedBackend;
  isSelected: boolean;
  isBusy: boolean;
  onSelect: () => void;
  onStartStop: () => void;
  onRestart: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

export function isProcessAlive(profile: ManagedBackend) {
  return Boolean(profile.pid) || profile.status === "running" || profile.status === "starting";
}

function statusLabel(profile: ManagedBackend) {
  if (profile.pid && profile.status === "error") return "Running";
  switch (profile.status) {
    case "running": return "Running";
    case "starting": return "Starting";
    case "stopping": return "Stopping";
    case "error": return "Error";
    default: return "Stopped";
  }
}

function statusClass(profile: ManagedBackend) {
  if (profile.pid && profile.status === "error") {
    return "bg-amber-500/10 text-amber-600 border-amber-500/20";
  }
  switch (profile.status) {
    case "running": return "bg-emerald-500/10 text-emerald-600 border-emerald-500/20";
    case "starting":
    case "stopping": return "bg-blue-500/10 text-blue-600 border-blue-500/20";
    case "error": return "bg-red-500/10 text-red-600 border-red-500/20";
    default: return "bg-muted text-muted-foreground border-border";
  }
}

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${mins}m`;
}

function useUptime(profile: ManagedBackend): string | null {
  const [uptime, setUptime] = useState<string | null>(null);

  useEffect(() => {
    const isRunning = profile.status === "running" || (profile.pid && profile.status === "error");
    if (!isRunning || !profile.updated_at) {
      setUptime(null);
      return;
    }

    const update = () => {
      const now = Math.floor(Date.now() / 1000);
      const elapsed = now - profile.updated_at;
      setUptime(formatUptime(Math.max(0, elapsed)));
    };

    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [profile.status, profile.pid, profile.updated_at]);

  return uptime;
}

export function ProxyCard({
  profile,
  isSelected,
  isBusy,
  onSelect,
  onStartStop,
  onRestart,
  onEdit,
  onDelete,
}: ProxyCardProps) {
  const running = isProcessAlive(profile);
  const uptime = useUptime(profile);

  return (
    <Card
      className={cn(
        "cursor-pointer transition-all duration-200",
        isSelected
          ? "border-primary/60 bg-primary/5 shadow-md"
          : "hover:bg-muted/40 hover:border-border/80"
      )}
      onClick={onSelect}
    >
      <CardHeader className="space-y-2 p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <CardTitle className="truncate text-sm">{profile.name}</CardTitle>
              {profile.auto_restart && (
                <Badge variant="outline" className="gap-1 text-[9px] bg-blue-500/10 text-blue-600 border-blue-500/20 px-1 py-0">
                  <RefreshCw className="h-2 w-2" />
                  Auto
                </Badge>
              )}
            </div>
            <CardDescription className="mt-0.5 truncate font-mono text-[11px]">
              {profile.start_command}
            </CardDescription>
          </div>
          <div className="flex flex-col items-end gap-0.5">
            <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0", statusClass(profile))}>
              {statusLabel(profile)}
            </Badge>
            {uptime && (
              <Badge variant="outline" className="gap-1 font-mono text-[9px] text-muted-foreground px-1 py-0">
                <Clock className="h-2 w-2" />
                {uptime}
              </Badge>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant={running ? "secondary" : "default"}
            disabled={isBusy}
            onClick={(e) => { e.stopPropagation(); onStartStop(); }}
            className="h-6 px-2 text-[11px] gap-1"
          >
            {isBusy ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : running ? (
              <Square className="h-3 w-3" />
            ) : (
              <Play className="h-3 w-3" />
            )}
            {isBusy ? (running ? "Stopping..." : "Starting...") : running ? "Stop" : "Start"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={isBusy}
            onClick={(e) => { e.stopPropagation(); onRestart(); }}
            className="h-6 px-2 text-[11px] gap-1"
          >
            {isBusy ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <RotateCw className="h-3 w-3" />
            )}
            Restart
          </Button>
          <div className="w-px h-3.5 bg-border mx-0.5" />
          <Button
            size="sm"
            variant="ghost"
            disabled={isBusy}
            onClick={(e) => { e.stopPropagation(); onEdit(); }}
            className="h-6 px-1.5 text-[11px] gap-1"
          >
            <Edit className="h-3 w-3" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-1.5 text-[11px] gap-1 text-destructive hover:text-destructive"
            disabled={isBusy}
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </CardHeader>
    </Card>
  );
}
