import { useEffect, useRef, useState } from "react";
import { RefreshCw, Unplug, Copy, Key } from "lucide-react";
import { t } from "@/i18n";
import { useSettingsStore } from "@/stores/settingsStore";
import { useSyncStore } from "@/stores/syncStore";
import { parseError } from "@/lib/backend";
import { showErrorNotice, showSuccessNotice } from "@/lib/errorNotice";
import { cn } from "@/lib/utils";

export function SyncSettings() {
  const locale = useSettingsStore((s) => s.locale);
  const configured = useSyncStore((s) => s.configured);
  const serverUrl = useSyncStore((s) => s.serverUrl);
  const lastSyncTime = useSyncStore((s) => s.lastSyncTime);
  const syncState = useSyncStore((s) => s.syncState);
  const syncError = useSyncStore((s) => s.syncError);
  const configure = useSyncStore((s) => s.configure);
  const disconnect = useSyncStore((s) => s.disconnect);
  const generateKey = useSyncStore((s) => s.generateKey);
  const triggerSync = useSyncStore((s) => s.triggerSync);

  const prevServerUrl = useSyncStore((s) => s.prevServerUrl);
  const prevSyncKey = useSyncStore((s) => s.prevSyncKey);

  const [inputUrl, setInputUrl] = useState(serverUrl || prevServerUrl || "");
  const [inputKey, setInputKey] = useState(prevSyncKey || "");
  const [connecting, setConnecting] = useState(false);
  const prevFilled = useRef(false);

  const showSyncResultNotice = (result: { pulled: number; pushed: number }) => {
    const parts: string[] = [];
    if (result.pulled > 0) parts.push(t("sync.pulled", locale, { n: result.pulled }));
    if (result.pushed > 0) parts.push(t("sync.pushed", locale, { n: result.pushed }));
    if (parts.length > 0) showSuccessNotice(parts.join(" · "));
    else showSuccessNotice(t("sync.status.connected", locale));
  };

  useEffect(() => {
    if (!configured && prevServerUrl && !prevFilled.current) {
      setInputUrl(prevServerUrl);
      if (prevSyncKey) setInputKey(prevSyncKey);
      prevFilled.current = true;
    }
  }, [configured, prevServerUrl, prevSyncKey]);

  const handleConnect = async () => {
    if (!inputUrl.trim() || !inputKey.trim()) return;
    setConnecting(true);
    try {
      await configure(inputUrl.trim(), inputKey.trim());
      const result = await triggerSync();
      if (!result) {
        throw new Error(useSyncStore.getState().syncError || t("sync.status.error", locale));
      }
      showSyncResultNotice(result);
    } catch (e) {
      showErrorNotice(parseError(e));
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      await disconnect();
    } catch (e) {
      showErrorNotice(parseError(e));
    }
  };

  const handleGenerateKey = async () => {
    try {
      const key = await generateKey();
      setInputKey(key);
    } catch (e) {
      showErrorNotice(parseError(e));
    }
  };

  const handleSync = () => {
    void triggerSync().then((result) => {
      if (result) {
        showSyncResultNotice(result);
      }
    });
  };

  const handleCopyKey = () => {
    if (inputKey) void navigator.clipboard.writeText(inputKey);
  };

  const formatTime = (ts: number) => {
    if (!ts) return t("sync.last_sync.never", locale);
    return new Date(ts * 1000).toLocaleString();
  };

  const statusLabel = () => {
    switch (syncState) {
      case "syncing":
        return t("sync.status.syncing", locale);
      case "done":
        return t("sync.status.done", locale);
      case "error":
        return syncError || t("sync.status.error", locale);
      default:
        return configured
          ? t("sync.status.connected", locale)
          : t("sync.status.not_configured", locale);
    }
  };

  const statusColor = () => {
    switch (syncState) {
      case "syncing":
        return "text-accent";
      case "done":
        return "text-green-500";
      case "error":
        return "text-danger";
      default:
        return configured ? "text-green-500" : "text-text-3";
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="mb-2.5 block text-[15px] font-medium text-text-2">
          {t("sync.title", locale)}
        </label>
        <p className="mb-4 text-[13px] text-text-3">{t("sync.desc", locale)}</p>
      </div>

      {!configured ? (
        <div className="space-y-3">
          <div>
            <label className="mb-1.5 block text-[13px] text-text-3">
              {t("sync.server_url", locale)}
            </label>
            <input
              type="text"
              value={inputUrl}
              onChange={(e) => setInputUrl(e.target.value)}
              placeholder={t("sync.server_url.placeholder", locale)}
              className="w-full border border-border bg-surface-2 px-4 py-2.5 text-[14px] text-text-1 outline-none focus:border-accent"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-[13px] text-text-3">{t("sync.key", locale)}</label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={inputKey}
                  onChange={(e) => setInputKey(e.target.value)}
                  placeholder={t("sync.key.placeholder", locale)}
                  className="w-full border border-border bg-surface-2 px-4 py-2.5 pr-8 text-[14px] font-mono text-text-1 outline-none focus:border-accent"
                />
                {inputKey && (
                  <button
                    type="button"
                    onClick={handleCopyKey}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-text-3 hover:text-text-1"
                    title="Copy"
                  >
                    <Copy size={14} />
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={handleGenerateKey}
                className="flex items-center gap-1.5 border border-border bg-surface-2 px-3 py-2.5 text-[13px] text-text-2 transition-colors hover:bg-surface-3"
              >
                <Key size={14} />
                {t("sync.generate_key", locale)}
              </button>
            </div>
          </div>
          {(prevServerUrl || prevSyncKey) && (
            <p className="text-[12px] text-text-3">{t("sync.prev_config", locale)}</p>
          )}
          <button
            type="button"
            onClick={handleConnect}
            disabled={connecting || !inputUrl.trim() || !inputKey.trim()}
            className={cn(
              "w-full border py-2.5 text-center text-[14px] font-medium transition-all",
              connecting || !inputUrl.trim() || !inputKey.trim()
                ? "border-border bg-surface-2 text-text-3 cursor-not-allowed"
                : "border-accent bg-accent-soft text-accent hover:bg-accent/20",
            )}
          >
            {connecting ? t("sync.status.syncing", locale) : t("sync.connect", locale)}
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between border border-border bg-surface-2 px-4 py-3">
            <div>
              <p className="text-[13px] text-text-3">{serverUrl}</p>
              <p className={cn("mt-1 text-[13px] font-medium", statusColor())}>{statusLabel()}</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleSync}
                disabled={syncState === "syncing"}
                className={cn(
                  "inline-flex h-8 w-8 items-center justify-center text-text-3 transition-colors hover:bg-surface-3 hover:text-text-1",
                  syncState === "syncing" && "animate-spin",
                )}
                title={t("sync.sync_now", locale)}
              >
                <RefreshCw size={16} />
              </button>
              <button
                type="button"
                onClick={handleDisconnect}
                className="inline-flex h-8 w-8 items-center justify-center text-text-3 transition-colors hover:bg-danger/10 hover:text-danger"
                title={t("sync.disconnect", locale)}
              >
                <Unplug size={16} />
              </button>
            </div>
          </div>
          <p className="text-[13px] text-text-3">
            {t("sync.last_sync", locale)}: {formatTime(lastSyncTime)}
          </p>
        </div>
      )}
    </div>
  );
}
