import { useState, useEffect, useRef, useCallback } from "react";
import { backendsApi } from "@/lib/api";

export function useLogs(selectedId: string | null) {
  const [logs, setLogs] = useState<string[]>([]);
  const logScrollRef = useRef<HTMLDivElement | null>(null);
  const shouldFollowLogsRef = useRef(true);

  const refreshLogs = useCallback(async (id: string | null) => {
    if (!id) {
      setLogs([]);
      return;
    }
    try {
      setLogs(await backendsApi.logs(id));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load logs";
      setLogs([message]);
    }
  }, []);

  useEffect(() => {
    void refreshLogs(selectedId);
    const timer = window.setInterval(() => {
      void refreshLogs(selectedId);
    }, 2000);
    return () => window.clearInterval(timer);
  }, [selectedId, refreshLogs]);

  useEffect(() => {
    const el = logScrollRef.current;
    if (el && shouldFollowLogsRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [logs]);

  const handleScroll = useCallback(() => {
    const el = logScrollRef.current;
    if (el) {
      const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      shouldFollowLogsRef.current = distanceFromBottom < 24;
    }
  }, []);

  return {
    logs,
    logScrollRef,
    shouldFollowLogsRef,
    handleScroll,
    refreshLogs,
  };
}
