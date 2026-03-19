import { RefreshCw, Cloud, AlertCircle } from "lucide-react";
import { useSyncStore } from "@/stores/syncStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";

export function SyncIndicator() {
  const configured = useSyncStore((s) => s.configured);
  const syncState = useSyncStore((s) => s.syncState);
  const triggerSync = useSyncStore((s) => s.triggerSync);
  const locale = useSettingsStore((s) => s.locale);

  if (!configured) return null;

  const icon = () => {
    switch (syncState) {
      case "syncing":
        return <RefreshCw size={13} className="animate-spin" />;
      case "error":
        return <AlertCircle size={13} />;
      case "done":
        return <Cloud size={13} />;
      default:
        return <Cloud size={13} />;
    }
  };

  const color = () => {
    switch (syncState) {
      case "syncing":
        return "text-accent";
      case "error":
        return "text-danger";
      case "done":
        return "text-green-500";
      default:
        return "text-text-3";
    }
  };

  const tooltip = () => {
    switch (syncState) {
      case "syncing":
        return t("sync.status.syncing", locale);
      case "error":
        return t("sync.status.error", locale);
      case "done":
        return t("sync.status.done", locale);
      default:
        return t("sync.sync_now", locale);
    }
  };

  return (
    <button
      type="button"
      onClick={() => triggerSync()}
      disabled={syncState === "syncing"}
      className={cn(
        "inline-flex h-6 w-6 items-center justify-center transition-colors hover:bg-surface-3",
        color(),
      )}
      title={tooltip()}
    >
      {icon()}
    </button>
  );
}
