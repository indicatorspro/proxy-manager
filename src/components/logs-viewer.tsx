import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Radio, Loader2, Heart, RefreshCw } from "lucide-react";
import { backendsApi, type ManagedBackend } from "@/lib/api";
import { toast } from "sonner";

interface LogsViewerProps {
  selected: ManagedBackend | null;
  logs: string[];
  liveMode: boolean;
  onToggleLiveMode: () => void;
}

export function LogsViewer({ selected, logs, liveMode, onToggleLiveMode }: LogsViewerProps) {
  const logScrollRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);

  useEffect(() => {
    if (autoScroll && logScrollRef.current) {
      logScrollRef.current.scrollTop = logScrollRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const handleScroll = () => {
    if (!logScrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = logScrollRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
    setAutoScroll(isAtBottom);
  };

  const handleHealthCheck = async () => {
    if (!selected) return;
    setLoadingAction("health");
    try {
      const result = await backendsApi.checkHealth(selected.id);
      if (result.ok) {
        toast.success(result.message, { description: `${result.latency_ms}ms - ${result.url}` });
      } else {
        toast.error(result.message, { description: result.url });
      }
    } catch (error) {
      toast.error("Health check failed", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setLoadingAction(null);
    }
  };

  const handleListModels = async () => {
    if (!selected) return;
    setLoadingAction("models");
    try {
      const models = await backendsApi.listModels(selected.id);
      if (models.length === 0) {
        toast.info("No models found", { description: "This backend doesn't expose /v1/models" });
      } else {
        toast.success(`Found ${models.length} model(s)`, {
          description: (
            <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap text-xs font-mono">
              {models.join("\n")}
            </pre>
          ),
          duration: 8000,
        });
      }
    } catch (error) {
      toast.error("Failed to list models", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setLoadingAction(null);
    }
  };

  return (
    <Card className="flex min-h-0 flex-col">
      <CardHeader className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="text-base">{selected?.name ?? "Logs"}</CardTitle>
            <CardDescription className="truncate font-mono text-xs">
              {selected?.working_dir || selected?.start_command || "Select a proxy"}
            </CardDescription>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {selected?.pid && <Badge variant="secondary" className="text-[10px]">PID {selected.pid}</Badge>}
            {selected && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!selected.port || loadingAction === "health"}
                  onClick={handleHealthCheck}
                  className="h-7 px-2 text-xs gap-1"
                  title="Health check"
                >
                  {loadingAction === "health" ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Heart className="h-3 w-3" />
                  )}
                  Health
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!selected.port || loadingAction === "models"}
                  onClick={handleListModels}
                  className="h-7 px-2 text-xs gap-1"
                  title="List models"
                >
                  {loadingAction === "models" ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3 w-3" />
                  )}
                  Models
                </Button>
                <Button
                  variant={liveMode ? "default" : "outline"}
                  size="sm"
                  onClick={onToggleLiveMode}
                  className="h-7 px-2 text-xs gap-1"
                >
                  {liveMode ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Radio className="h-3 w-3" />
                  )}
                  {liveMode ? "Live" : "Live Mode"}
                </Button>
              </>
            )}
          </div>
        </div>
        {liveMode && (
          <p className="text-xs text-muted-foreground mt-1">
            Auto-refreshing every 2s · Stops after 3 minutes
          </p>
        )}
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col gap-3 p-4 pt-0">
        <div
          ref={logScrollRef}
          className="min-h-[360px] flex-1 overflow-auto rounded-md border bg-black p-3"
          onScroll={handleScroll}
        >
          <pre className="whitespace-pre-wrap break-words text-xs leading-relaxed text-green-100">
            {logs.length > 0
              ? logs.join("\n")
              : selected
                ? "No logs yet."
                : "Select a proxy to see logs."}
          </pre>
        </div>
        {!autoScroll && logs.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setAutoScroll(true);
              if (logScrollRef.current) {
                logScrollRef.current.scrollTop = logScrollRef.current.scrollHeight;
              }
            }}
            className="w-full"
          >
            Scroll to bottom
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
