import { X } from "lucide-react";
import { t } from "@/i18n";
import { useSettingsStore } from "@/stores/settingsStore";
import { useSyncStore } from "@/stores/syncStore";
import { parseError } from "@/lib/backend";
import { showErrorNotice } from "@/lib/errorNotice";

export function ConflictDialog() {
  const locale = useSettingsStore((s) => s.locale);
  const conflicts = useSyncStore((s) => s.conflicts);
  const showConflictDialog = useSyncStore((s) => s.showConflictDialog);
  const resolveConflict = useSyncStore((s) => s.resolveConflict);
  const dismissConflicts = useSyncStore((s) => s.dismissConflicts);

  if (!showConflictDialog || conflicts.length === 0) return null;

  const handleResolve = async (index: number, keep: "local" | "remote") => {
    try {
      await resolveConflict(conflicts[index], keep);
    } catch (e) {
      showErrorNotice(parseError(e));
    }
  };

  const formatEntity = (type: string, id: string) => {
    const typeLabels: Record<string, string> = {
      todo: "Todo",
      archived_todo: "Archived Todo",
      tag: "Tag",
      tag_group: "Tag Group",
      settings: "Settings",
      event: "Event",
    };
    return `${typeLabels[type] || type} · ${id.slice(0, 8)}`;
  };

  const tryParseTitle = (json: string): string | null => {
    try {
      const obj: Record<string, unknown> = JSON.parse(json) as Record<string, unknown>;
      if (typeof obj.title === "string") return obj.title;
      if (typeof obj.name === "string") return obj.name;
      return null;
    } catch {
      return null;
    }
  };

  const formatConflictValue = (action: string, data: string) => {
    if (action === "delete") {
      return "删除该项";
    }
    return tryParseTitle(data) || data.slice(0, 80) || "空内容";
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="mx-4 w-full max-w-lg border border-border bg-surface-1 shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
          <h2 className="text-[15px] font-semibold text-text-1">
            {t("sync.conflict.title", locale)}
          </h2>
          <button
            type="button"
            onClick={dismissConflicts}
            className="inline-flex h-7 w-7 items-center justify-center text-text-3 transition-colors hover:bg-surface-3 hover:text-text-1"
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-5 py-4">
          <p className="mb-4 text-[13px] text-text-3">{t("sync.conflict.desc", locale)}</p>

          <div className="max-h-[400px] space-y-3 overflow-y-auto">
            {conflicts.map((conflict, i) => {
              return (
                <div
                  key={`${conflict.entityType}-${conflict.entityId}`}
                  className="border border-border bg-surface-2 p-4"
                >
                  <p className="mb-2 text-[13px] font-medium text-text-1">
                    {formatEntity(conflict.entityType, conflict.entityId)}
                  </p>

                  <div className="mb-3 grid grid-cols-2 gap-3">
                    <div>
                      <p className="mb-1 text-[11px] font-medium uppercase text-text-3">
                        {t("sync.conflict.local", locale)}
                      </p>
                      <p className="line-clamp-2 text-[13px] text-text-2">
                        {formatConflictValue(conflict.localAction, conflict.localData)}
                      </p>
                      <p className="mt-1 text-[11px] text-text-3">
                        {new Date(conflict.localTimestamp * 1000).toLocaleString()}
                      </p>
                    </div>
                    <div>
                      <p className="mb-1 text-[11px] font-medium uppercase text-text-3">
                        {t("sync.conflict.remote", locale)}
                      </p>
                      <p className="line-clamp-2 text-[13px] text-text-2">
                        {formatConflictValue(conflict.remoteAction, conflict.remoteData)}
                      </p>
                      <p className="mt-1 text-[11px] text-text-3">
                        {new Date(conflict.remoteTimestamp * 1000).toLocaleString()}
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleResolve(i, "local")}
                      className="flex-1 border border-border bg-surface-1 py-2 text-center text-[13px] font-medium text-text-2 transition-colors hover:bg-surface-3"
                    >
                      {t("sync.conflict.local", locale)}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleResolve(i, "remote")}
                      className="flex-1 border border-accent bg-accent-soft py-2 text-center text-[13px] font-medium text-accent transition-colors hover:bg-accent/20"
                    >
                      {t("sync.conflict.remote", locale)}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
