import { useEffect, useState } from "react";
import { isEnabled, enable, disable } from "@tauri-apps/plugin-autostart";
import { t } from "@/i18n";
import { useSettingsStore } from "@/stores/settingsStore";
import { exportAllData, importAllData } from "@/lib/export";
import { parseError } from "@/lib/backend";
import { showErrorNotice, showSuccessNotice } from "@/lib/errorNotice";
import { cn, formatHourLabel } from "@/lib/utils";

export function SettingsPanel() {
  const [transferMsg, setTransferMsg] = useState<{
    type: "success" | "error";
    title: string;
    details?: string[];
  } | null>(null);
  const [autostart, setAutostart] = useState(false);

  useEffect(() => {
    isEnabled()
      .then(setAutostart)
      .catch(() => setAutostart(false));
  }, []);

  const toggleAutostart = async () => {
    try {
      if (autostart) {
        await disable();
        setAutostart(false);
      } else {
        await enable();
        setAutostart(true);
      }
    } catch (e) {
      console.error("Failed to toggle autostart:", e);
    }
  };

  const theme = useSettingsStore((s) => s.theme);
  const setTheme = useSettingsStore((s) => s.setTheme);
  const locale = useSettingsStore((s) => s.locale);
  const setLocale = useSettingsStore((s) => s.setLocale);
  const showTimeline = useSettingsStore((s) => s.showTimeline);
  const toggleTimeline = useSettingsStore((s) => s.toggleTimeline);
  const unlockHour = useSettingsStore((s) => s.tomorrowPlanningUnlockHour);
  const setUnlock = useSettingsStore((s) => s.setTomorrowPlanningUnlockHour);
  const tlStart = useSettingsStore((s) => s.timelineStartHour);
  const tlEnd = useSettingsStore((s) => s.timelineEndHour);
  const setTlRange = useSettingsStore((s) => s.setTimelineRange);

  const userName = useSettingsStore((s) => s.userName);
  const setUserName = useSettingsStore((s) => s.setUserName);
  const miniAlwaysOnTop = useSettingsStore((s) => s.miniAlwaysOnTop);
  const miniFadeOnBlur = useSettingsStore((s) => s.miniFadeOnBlur);
  const miniFadeOpacity = useSettingsStore((s) => s.miniFadeOpacity);

  const enableSubtasks = useSettingsStore((s) => s.enableSubtasks);
  const setEnableSubtasks = useSettingsStore((s) => s.setEnableSubtasks);
  const maxDurationDays = useSettingsStore((s) => s.maxDurationDays);
  const setMaxDurationDays = useSettingsStore((s) => s.setMaxDurationDays);

  const pill = (active: boolean) =>
    cn(
      "flex-1 border py-2.5 text-center text-[16px] font-medium transition-all",
      active
        ? "border-accent bg-accent-soft text-accent"
        : "border-border bg-surface-2 text-text-2 hover:bg-surface-3",
    );

  const showTransferMessage = (
    next: { type: "success" | "error"; title: string; details?: string[] } | null,
  ) => {
    setTransferMsg(next);
    if (next) setTimeout(() => setTransferMsg(null), 4000);
  };

  return (
    <div className="space-y-7">
      <div>
        <label className="mb-2.5 block text-[15px] font-medium text-text-2">
          {t("settings.name", locale)}
        </label>
        <input
          type="text"
          value={userName}
          onChange={(e) => setUserName(e.target.value)}
          placeholder="TinyDo"
          className="w-full border border-border bg-surface-2 px-4 py-2.5 text-[16px] text-text-1 outline-none focus:border-accent"
        />
        <p className="mt-2 text-[15px] text-text-3">{t("settings.name.desc", locale)}</p>
      </div>
      <div>
        <label className="mb-2.5 block text-[15px] font-medium text-text-2">
          {t("settings.theme", locale)}
        </label>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setTheme("light")}
            className={pill(theme === "light")}
          >
            {t("settings.light", locale)}
          </button>
          <button type="button" onClick={() => setTheme("dark")} className={pill(theme === "dark")}>
            {t("settings.dark", locale)}
          </button>
        </div>
      </div>
      <div>
        <label className="mb-2.5 block text-[15px] font-medium text-text-2">
          {t("settings.language", locale)}
        </label>
        <div className="flex gap-2">
          <button type="button" onClick={() => setLocale("zh")} className={pill(locale === "zh")}>
            中文
          </button>
          <button type="button" onClick={() => setLocale("en")} className={pill(locale === "en")}>
            English
          </button>
        </div>
      </div>
      <div>
        <label className="mb-2.5 block text-[15px] font-medium text-text-2">
          {t("settings.unlock_hour", locale)}
        </label>
        <select
          value={unlockHour}
          onChange={(e) => setUnlock(Number(e.target.value))}
          className="w-full border border-border bg-surface-2 px-4 py-3 text-[16px] text-text-1 outline-none"
        >
          {Array.from({ length: 24 }, (_, h) => (
            <option key={h} value={h}>
              {formatHourLabel(h, locale)}
            </option>
          ))}
        </select>
        <p className="mt-2 text-[15px] text-text-3">{t("settings.unlock_hour.desc", locale)}</p>
      </div>
      <div>
        <label className="mb-2.5 block text-[15px] font-medium text-text-2">
          {t("settings.timeline", locale)}
        </label>
        <button
          type="button"
          role="switch"
          aria-checked={showTimeline}
          onClick={toggleTimeline}
          className={cn(
            "relative inline-flex h-8 w-14 items-center border transition-colors",
            showTimeline ? "border-accent bg-accent" : "border-border bg-surface-2",
          )}
        >
          <span
            className={cn(
              "inline-block h-6 w-6 bg-white shadow transition-transform",
              showTimeline ? "translate-x-7" : "translate-x-1",
            )}
          />
        </button>
      </div>
      <div>
        <label className="mb-2.5 block text-[15px] font-medium text-text-2">
          {t("settings.timeline_range", locale)}
        </label>
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <label className="mb-1 block text-[15px] text-text-3">
              {t("settings.timeline_range.from", locale)}
            </label>
            <select
              value={tlStart}
              onChange={(e) => setTlRange(Number(e.target.value), tlEnd)}
              className="w-full border border-border bg-surface-2 px-4 py-3 text-[16px] text-text-1 outline-none"
            >
              {Array.from({ length: 24 }, (_, h) => (
                <option key={h} value={h}>
                  {h}:00
                </option>
              ))}
            </select>
          </div>
          <div className="flex-1">
            <label className="mb-1 block text-[15px] text-text-3">
              {t("settings.timeline_range.to", locale)}
            </label>
            <select
              value={tlEnd}
              onChange={(e) => setTlRange(tlStart, Number(e.target.value))}
              className="w-full border border-border bg-surface-2 px-4 py-3 text-[16px] text-text-1 outline-none"
            >
              {Array.from({ length: 24 }, (_, h) => (
                <option key={h} value={h + 1}>
                  {h + 1}:00
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
      <div>
        <label className="mb-2.5 block text-[15px] font-medium text-text-2">
          {t("settings.subtasks", locale)}
        </label>
        <button
          type="button"
          role="switch"
          aria-checked={enableSubtasks}
          onClick={() => setEnableSubtasks(!enableSubtasks)}
          className={cn(
            "relative inline-flex h-8 w-14 items-center border transition-colors",
            enableSubtasks ? "border-accent bg-accent" : "border-border bg-surface-2",
          )}
        >
          <span
            className={cn(
              "inline-block h-6 w-6 bg-white shadow transition-transform",
              enableSubtasks ? "translate-x-7" : "translate-x-1",
            )}
          />
        </button>
      </div>
      <div>
        <label className="mb-2.5 block text-[15px] font-medium text-text-2">
          {t("settings.max_duration", locale)}
        </label>
        <select
          value={maxDurationDays}
          onChange={(e) => setMaxDurationDays(Number(e.target.value))}
          className="w-full border border-border bg-surface-2 px-4 py-3 text-[16px] text-text-1 outline-none"
        >
          {Array.from({ length: 7 }, (_, i) => i + 1).map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-2.5 block text-[15px] font-medium text-text-2">
          {t("settings.mini", locale)}
        </label>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[15px] text-text-2">
              {t("settings.mini.always_on_top", locale)}
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={miniAlwaysOnTop}
              onClick={() =>
                useSettingsStore
                  .getState()
                  .setMiniAlwaysOnTop(!useSettingsStore.getState().miniAlwaysOnTop)
              }
              className={cn(
                "relative inline-flex h-7 w-12 items-center border transition-colors",
                miniAlwaysOnTop ? "border-accent bg-accent" : "border-border bg-surface-2",
              )}
            >
              <span
                className={cn(
                  "inline-block h-5 w-5 bg-white shadow transition-transform",
                  miniAlwaysOnTop ? "translate-x-6" : "translate-x-0.5",
                )}
              />
            </button>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[15px] text-text-2">
              {t("settings.mini.fade_on_blur", locale)}
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={miniFadeOnBlur}
              onClick={() =>
                useSettingsStore
                  .getState()
                  .setMiniFadeOnBlur(!useSettingsStore.getState().miniFadeOnBlur)
              }
              className={cn(
                "relative inline-flex h-7 w-12 items-center border transition-colors",
                miniFadeOnBlur ? "border-accent bg-accent" : "border-border bg-surface-2",
              )}
            >
              <span
                className={cn(
                  "inline-block h-5 w-5 bg-white shadow transition-transform",
                  miniFadeOnBlur ? "translate-x-6" : "translate-x-0.5",
                )}
              />
            </button>
          </div>
          {miniFadeOnBlur && (
            <div className="flex items-center justify-between">
              <span className="text-[15px] text-text-2">
                {t("settings.mini.fade_opacity", locale)}
              </span>
              <input
                type="range"
                min="10"
                max="90"
                step="5"
                value={Math.round(miniFadeOpacity * 100)}
                onChange={(e) =>
                  useSettingsStore.getState().setMiniFadeOpacity(Number(e.target.value) / 100)
                }
                className="w-24"
              />
              <span className="w-10 text-right text-[14px] text-text-3">
                {Math.round(miniFadeOpacity * 100)}%
              </span>
            </div>
          )}
        </div>
      </div>
      <div>
        <label className="mb-2.5 block text-[15px] font-medium text-text-2">
          {t("settings.autostart", locale)}
        </label>
        <div className="flex items-center justify-between">
          <span className="text-[15px] text-text-2">{t("settings.autostart.desc", locale)}</span>
          <button
            type="button"
            role="switch"
            aria-checked={autostart}
            onClick={() => void toggleAutostart()}
            className={cn(
              "relative inline-flex h-7 w-12 items-center border transition-colors",
              autostart ? "border-accent bg-accent" : "border-border bg-surface-2",
            )}
          >
            <span
              className={cn(
                "inline-block h-5 w-5 bg-white shadow transition-transform",
                autostart ? "translate-x-6" : "translate-x-0.5",
              )}
            />
          </button>
        </div>
      </div>
      <div>
        <label className="mb-2.5 block text-[15px] font-medium text-text-2">
          {t("settings.shortcut", locale)}
        </label>
        <p className="text-[15px] text-text-3">{t("settings.shortcut.desc", locale)}</p>
      </div>
      <div>
        <label className="mb-2.5 block text-[15px] font-medium text-text-2">
          {t("settings.export", locale)}
        </label>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              void exportAllData()
                .then((filePath) => {
                  if (!filePath) return;
                  showSuccessNotice(t("settings.export.success", locale));
                  showTransferMessage({
                    type: "success",
                    title: t("settings.export.success", locale),
                    details: [
                      t("settings.export.detail.tasks", locale),
                      t("settings.export.detail.settings", locale),
                    ],
                  });
                })
                .catch(showErrorNotice);
            }}
            className="flex-1 border border-border bg-surface-2 py-3 text-[16px] font-medium text-text-1 transition-colors hover:bg-surface-3"
          >
            {t("settings.export", locale)}
          </button>
          <button
            type="button"
            onClick={async () => {
              setTransferMsg(null);
              try {
                const result = await importAllData();
                if (!result) return;
                const total = result.todosCount + result.archivedCount;
                showTransferMessage({
                  type: "success",
                  title: t("settings.import.success", locale, { n: total }),
                  details: [
                    t("settings.import.detail.todos", locale, { n: result.todosCount }),
                    t("settings.import.detail.archived", locale, { n: result.archivedCount }),
                    t("settings.import.detail.tags", locale, { n: result.tagsCount }),
                    t("settings.import.detail.groups", locale, { n: result.tagGroupsCount }),
                    t(
                      result.settingsUpdated
                        ? "settings.import.detail.settings_updated"
                        : "settings.import.detail.settings_skipped",
                      locale,
                    ),
                  ],
                });
              } catch (error) {
                showTransferMessage({
                  type: "error",
                  title: parseError(error) || t("settings.import.error", locale),
                });
              }
            }}
            className="flex-1 border border-border bg-surface-2 py-3 text-[16px] font-medium text-text-1 transition-colors hover:bg-surface-3"
          >
            {t("settings.import", locale)}
          </button>
        </div>
        <p className="mt-2 text-[15px] text-text-3">{t("settings.export.desc", locale)}</p>
        <p className="mt-1 text-[14px] text-text-3">{t("settings.import.desc", locale)}</p>
        <div className="mt-2 border border-border bg-surface-2/60 px-3 py-2 text-[13px] text-text-3">
          <p>{t("settings.backup.includes", locale)}</p>
        </div>
        {transferMsg && (
          <div
            className={cn(
              "mt-2 space-y-1 border px-3 py-2 text-[14px]",
              transferMsg.type === "success"
                ? "border-success/30 bg-success/5 text-success"
                : "border-danger/30 bg-danger/5 text-danger",
            )}
          >
            <p className="font-medium">{transferMsg.title}</p>
            {transferMsg.details?.map((detail) => (
              <p key={detail} className="text-[13px]">
                {detail}
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
