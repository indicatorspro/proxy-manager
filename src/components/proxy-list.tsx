import { type ManagedBackend } from "@/lib/api";
import { ProxyCard } from "./proxy-card";
import { Button } from "@/components/ui/button";
import { Plus, Loader2 } from "lucide-react";

interface ProxyListProps {
  profiles: ManagedBackend[];
  selectedId: string | null;
  busyId: string | null;
  loading: boolean;
  onSelect: (id: string) => void;
  onStartStop: (profile: ManagedBackend) => void;
  onRestart: (profile: ManagedBackend) => void;
  onEdit: (profile: ManagedBackend) => void;
  onDelete: (profile: ManagedBackend) => void;
  onAdd: () => void;
}

export function ProxyList({
  profiles, selectedId, busyId, loading,
  onSelect, onStartStop, onRestart, onEdit, onDelete, onAdd,
}: ProxyListProps) {
  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Loading proxies...
      </div>
    );
  }

  if (profiles.length === 0) {
    return (
      <div className="flex h-64 flex-col items-center justify-center rounded-lg border border-dashed text-center">
        <p className="text-sm font-medium">No proxies yet</p>
        <p className="mt-1 text-sm text-muted-foreground">Add a command to get started</p>
        <Button className="mt-4" onClick={onAdd}>
          <Plus className="mr-1.5 h-4 w-4" />
          Add Proxy
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {profiles.map((profile) => (
        <ProxyCard
          key={profile.id}
          profile={profile}
          isSelected={selectedId === profile.id}
          isBusy={busyId === profile.id}
          onSelect={() => onSelect(profile.id)}
          onStartStop={() => onStartStop(profile)}
          onRestart={() => onRestart(profile)}
          onEdit={() => onEdit(profile)}
          onDelete={() => onDelete(profile)}
        />
      ))}
    </div>
  );
}
