import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { toast } from "sonner";
import {
  backendsApi,
  type CreateBackendRequest,
  type ManagedBackend,
} from "@/lib/api";

function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Unknown error";
}

export function useProxies() {
  const [profiles, setProfiles] = useState<ManagedBackend[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [liveMode, setLiveMode] = useState(false);
  const liveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const selected = useMemo(
    () => profiles.find((profile) => profile.id === selectedId) ?? null,
    [profiles, selectedId],
  );

  const hasActiveProxies = useMemo(
    () => profiles.some((p) => p.status === "running" || p.status === "starting" || p.status === "stopping"),
    [profiles],
  );

  const refresh = useCallback(async (quiet = false) => {
    try {
      if (!quiet) setLoading(true);
      const next = await backendsApi.list();
      setProfiles(next);
      setSelectedId((current) => current ?? next[0]?.id ?? null);
    } catch (error) {
      toast.error("Failed to load proxies", { description: extractErrorMessage(error) || undefined });
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshLogs = useCallback(async (id: string | null) => {
    if (!id) { setLogs([]); return; }
    try { setLogs(await backendsApi.logs(id)); }
    catch (error) { setLogs([extractErrorMessage(error) || "Failed to load logs"]); }
  }, []);

  const withBusy = useCallback(async <T>(id: string, fn: () => Promise<T>): Promise<T | null> => {
    try {
      setBusyId(id);
      const result = await fn();
      await refresh(true);
      return result;
    } catch (error) {
      toast.error(extractErrorMessage(error));
      return null;
    } finally {
      setBusyId(null);
    }
  }, [refresh]);

  const create = useCallback(async (req: CreateBackendRequest) => {
    const saved = await backendsApi.create(req);
    setSelectedId(saved.id);
    await refresh(true);
    toast.success("Proxy added");
    return saved;
  }, [refresh]);

  const update = useCallback(async (id: string, req: CreateBackendRequest) => {
    const saved = await backendsApi.update(id, req);
    setSelectedId(saved.id);
    await refresh(true);
    toast.success("Proxy updated");
    return saved;
  }, [refresh]);

  const remove = useCallback(async (id: string) => {
    await backendsApi.delete(id);
    setSelectedId(null);
    await refresh(true);
    toast.success("Proxy removed");
  }, [refresh]);

  const runAction = useCallback(async (profile: ManagedBackend, action: "start" | "stop" | "restart") => {
    const result = await withBusy(profile.id, async () => {
      const updated = action === "start" ? await backendsApi.start(profile.id) :
        action === "stop" ? await backendsApi.stop(profile.id) :
        await backendsApi.restart(profile.id);
      setSelectedId(updated.id);
      await refreshLogs(updated.id);
      return updated;
    });
    return result;
  }, [withBusy, refreshLogs]);

  const sendInput = useCallback(async (id: string, input: string) => {
    const result = await withBusy(id, async () => {
      const updated = await backendsApi.sendInput(id, input);
      setSelectedId(updated.id);
      await refreshLogs(updated.id);
      return updated;
    });
    return result;
  }, [withBusy, refreshLogs]);

  const toggleLiveMode = useCallback(() => setLiveMode((prev) => !prev), []);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => { void refreshLogs(selectedId); }, [selectedId, refreshLogs]);

  useEffect(() => {
    if (!hasActiveProxies && !liveMode) return;
    const timer = window.setInterval(() => {
      void refresh(true);
      void refreshLogs(selectedId);
    }, 2000);
    return () => window.clearInterval(timer);
  }, [selectedId, refresh, refreshLogs, hasActiveProxies, liveMode]);

  useEffect(() => {
    if (liveMode) {
      liveTimerRef.current = setTimeout(() => {
        setLiveMode(false);
        toast.info("Live mode ended", { description: "3 minutes of real-time monitoring completed." });
      }, 3 * 60 * 1000);
    } else {
      if (liveTimerRef.current) { clearTimeout(liveTimerRef.current); liveTimerRef.current = null; }
    }
    return () => { if (liveTimerRef.current) clearTimeout(liveTimerRef.current); };
  }, [liveMode]);

  return {
    profiles, selectedId, setSelectedId, selected, logs, loading, busyId,
    liveMode, toggleLiveMode, hasActiveProxies, refresh, refreshLogs,
    create, update, remove, runAction, sendInput,
  };
}
