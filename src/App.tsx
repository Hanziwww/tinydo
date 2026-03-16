import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getCurrentWindow, LogicalSize, LogicalPosition } from "@tauri-apps/api/window";
import { AlertTriangle, Calendar, Hash, Settings2 } from "lucide-react";
import {
  cn,
  formatDate,
  formatHourLabel,
  getOverdueDays,
  getTodayDate,
  getTodayDateKey,
  getTomorrowDate,
  getTomorrowDateKey,
  isTomorrowPlanningUnlocked,
} from "@/lib/utils";
import { t } from "@/i18n";
import { useSettingsStore } from "@/stores/settingsStore";
import { useTodoStore } from "@/stores/todoStore";
import { useTagStore } from "@/stores/tagStore";
import { TitleBar } from "@/components/TitleBar";
import { TodoInput } from "@/components/TodoInput";
import { TodoList } from "@/components/TodoList";
import { TodoDetail } from "@/components/TodoDetail";
import { TagFilter } from "@/components/TagFilter";
import { TagManager } from "@/components/TagManager";
import { SettingsPanel } from "@/components/SettingsPanel";
import { StatusBar } from "@/components/StatusBar";
import { Timeline } from "@/components/Timeline";
import { MiniMode } from "@/components/MiniMode";
import { FadeTransition } from "@/components/FadeTransition";
import { useReminders } from "@/hooks/useReminders";
import { initBackendData, settingsToStore } from "@/lib/init";
import type { PlanningBoard } from "@/types";
import { HistoryPanel } from "@/components/HistoryPanel";

const MINI_W = 320;
const MINI_H = 420;

function App() {
  const [showTags, setShowTags] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [board, setBoard] = useState<PlanningBoard>("today");
  const [now, setNow] = useState(() => new Date());
  const [mini, setMini] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);

  const hydrated = useTodoStore((s) => s._hydrated);

  // Backend initialization: load data from SQLite (with localStorage migration)
  useEffect(() => {
    initBackendData()
      .then((data) => {
        useTodoStore.getState()._hydrate(data.todos, data.archivedTodos);
        useTagStore.getState()._hydrate(data.tags, data.tagGroups);
        useSettingsStore.getState()._hydrate(settingsToStore(data.settings));
      })
      .catch((e: unknown) => {
        console.error("Backend init failed:", e);
        setInitError(String(e));
      });
  }, []);

  const locale = useSettingsStore((s) => s.locale);
  const showTimeline = useSettingsStore((s) => s.showTimeline);
  const unlockHour = useSettingsStore((s) => s.tomorrowPlanningUnlockHour);
  const userName = useSettingsStore((s) => s.userName);
  const editingId = useTodoStore((s) => s.editingTodoId);
  const setEditingId = useTodoStore((s) => s.setEditingTodoId);
  const todos = useTodoStore((s) => s.todos);
  const viewMode = useTodoStore((s) => s.viewMode);

  useReminders();

  const todayD = getTodayDate(now);
  const todayK = getTodayDateKey(now);
  const tomorrowD = getTomorrowDate(now);
  const tomorrowK = getTomorrowDateKey(now);
  const unlocked = isTomorrowPlanningUnlocked(unlockHour, now);
  const bDate = board === "today" ? todayK : tomorrowK;
  const dispDate = board === "history" ? todayD : board === "today" ? todayD : tomorrowD;
  const overdueN = useMemo(
    () =>
      todos.filter(
        (td) => !td.completed && getOverdueDays(td.targetDate, todayK, td.durationDays) > 0,
      ).length,
    [todos, todayK],
  );

  const greeting =
    board === "history"
      ? t("app.greeting_history", locale)
      : board === "today"
        ? t("app.greeting", locale, { name: userName || "TinyDo" })
        : t("app.greeting_tomorrow", locale);

  useEffect(() => {
    if (!unlocked && board === "tomorrow") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sync board when tomorrow locks
      setBoard("today");
    }
  }, [board, unlocked]);
  const splitOverdueSubtasks = useTodoStore((s) => s.splitOverdueSubtasks);
  const prevTodayRef = useRef(todayK);
  useEffect(() => {
    const id = setInterval(() => {
      const next = new Date();
      setNow(next);
      const nextK = getTodayDateKey(next);
      if (prevTodayRef.current !== nextK) {
        prevTodayRef.current = nextK;
        splitOverdueSubtasks(nextK);
      }
    }, 30_000);
    return () => clearInterval(id);
  }, [splitOverdueSubtasks]);

  const miniOnTop = useSettingsStore((s) => s.miniAlwaysOnTop);
  const setFullModeRect = useSettingsStore((s) => s.setFullModeRect);
  const setMiniModePosition = useSettingsStore((s) => s.setMiniModePosition);

  const enterMini = useCallback(async () => {
    const win = getCurrentWindow();
    try {
      const sf = await win.scaleFactor();
      const size = await win.innerSize();
      const pos = await win.outerPosition();
      setFullModeRect({
        w: size.width / sf,
        h: size.height / sf,
        x: pos.x / sf,
        y: pos.y / sf,
      });
    } catch {
      setFullModeRect({ w: 1080, h: 780, x: 200, y: 100 });
    }
    await win.setResizable(false);
    await win.setAlwaysOnTop(miniOnTop);
    await win.setMinSize(new LogicalSize(MINI_W, 200));
    await win.setSize(new LogicalSize(MINI_W, MINI_H));
    const savedMiniPos = useSettingsStore.getState().miniModePosition;
    if (savedMiniPos) {
      await win.setPosition(new LogicalPosition(savedMiniPos.x, savedMiniPos.y));
    }
    setMini(true);
  }, [miniOnTop, setFullModeRect]);

  const exitMini = useCallback(async () => {
    const win = getCurrentWindow();
    try {
      const sf = await win.scaleFactor();
      const pos = await win.outerPosition();
      setMiniModePosition({ x: pos.x / sf, y: pos.y / sf });
    } catch {
      /* ignore */
    }
    await win.setAlwaysOnTop(false);
    await win.setMinSize(new LogicalSize(640, 480));
    const r = useSettingsStore.getState().fullModeRect ?? { w: 1080, h: 780, x: 200, y: 100 };
    await win.setSize(new LogicalSize(r.w, r.h));
    await win.setPosition(new LogicalPosition(r.x, r.y));
    await win.setResizable(true);
    setMini(false);
  }, [setMiniModePosition]);

  if (!hydrated) {
    return (
      <div className="flex h-full items-center justify-center bg-surface-0 text-text-1">
        <div className="text-center">
          {initError ? (
            <p className="text-sm text-red-400">{initError}</p>
          ) : (
            <p className="animate-pulse text-sm text-text-3">Loading...</p>
          )}
        </div>
      </div>
    );
  }

  if (mini) {
    return (
      <div className="mini-mode flex h-full flex-col bg-surface-0 p-1 text-text-1">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden border border-border bg-surface-1 shadow-lg">
          <MiniMode onExpand={exitMini} />
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex h-full min-h-0 select-none flex-col bg-surface-0 p-2 text-text-1">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden border border-border bg-surface-1 shadow-lg">
        <TitleBar onMiniMode={enterMini} />

        <header className="shrink-0 border-b border-border px-6 pb-3 pt-3">
          <div className="flex items-center justify-between">
            <FadeTransition transitionKey={board} className="flex items-baseline gap-3">
              <h1 className="text-[22px] font-extrabold leading-tight tracking-tight">
                {greeting}
              </h1>
              <p className="text-[14px] text-text-3">{formatDate(dispDate, locale)}</p>
            </FadeTransition>
            <div className="flex items-center gap-2">
              {overdueN > 0 && (
                <span className="flex items-center gap-1.5 bg-warning/10 px-2.5 py-1 text-[13px] font-semibold text-warning">
                  <AlertTriangle size={14} />
                  {t("status.overdue", locale, { n: overdueN })}
                </span>
              )}
              {!unlocked && (
                <span className="bg-surface-2 px-2.5 py-1 text-[13px] text-text-3">
                  {t("planning.unlock_at", locale, { time: formatHourLabel(unlockHour, locale) })}
                </span>
              )}
              <button
                type="button"
                onClick={() => setShowTags(!showTags)}
                className={cn(
                  "p-1.5 transition-colors",
                  showTags
                    ? "bg-accent-soft text-accent"
                    : "text-text-3 hover:bg-surface-2 hover:text-text-1",
                )}
              >
                <Hash size={17} />
              </button>
              <button
                type="button"
                onClick={() => setShowSettings(!showSettings)}
                className={cn(
                  "p-1.5 transition-colors",
                  showSettings
                    ? "bg-accent-soft text-accent"
                    : "text-text-3 hover:bg-surface-2 hover:text-text-1",
                )}
              >
                <Settings2 size={17} />
              </button>
            </div>
          </div>

          <div className="mt-2.5 flex items-center gap-5">
            <button
              type="button"
              onClick={() => setBoard("today")}
              className={cn(
                "border-b-2 pb-1 text-[15px] font-semibold transition-all duration-200",
                board === "today"
                  ? "border-accent text-accent"
                  : "border-transparent text-text-3 hover:text-text-2",
              )}
            >
              {t("board.today", locale)}
            </button>
            <button
              type="button"
              disabled={!unlocked}
              onClick={() => unlocked && setBoard("tomorrow")}
              className={cn(
                "border-b-2 pb-1 text-[15px] font-semibold transition-all duration-200",
                board === "tomorrow"
                  ? "border-accent text-accent"
                  : "border-transparent text-text-3 hover:text-text-2",
                !unlocked && "cursor-not-allowed opacity-40",
              )}
            >
              {t("board.tomorrow", locale)}
            </button>
            <button
              type="button"
              onClick={() => setBoard("history")}
              className={cn(
                "flex items-center gap-1.5 border-b-2 pb-1 text-[15px] font-semibold transition-all duration-200",
                board === "history"
                  ? "border-accent text-accent"
                  : "border-transparent text-text-3 hover:text-text-2",
              )}
            >
              <Calendar size={14} />
              {t("board.history", locale)}
            </button>
          </div>

          {board !== "history" && (
            <>
              <div className="mt-2.5">
                <TodoInput
                  board={board}
                  targetDate={bDate}
                  disabled={board === "tomorrow" && !unlocked}
                />
              </div>
              <TagFilter />
            </>
          )}
        </header>

        <div className="flex min-h-0 flex-1">
          <main className="flex min-w-0 flex-1 flex-col">
            {board === "history" ? (
              <FadeTransition transitionKey="history" className="min-h-0 flex-1 overflow-y-auto">
                <HistoryPanel />
              </FadeTransition>
            ) : (
              <>
                <FadeTransition
                  transitionKey={`${board}-${viewMode}`}
                  className="min-h-0 flex-1 overflow-y-auto"
                >
                  <TodoList board={board} boardDate={bDate} />
                </FadeTransition>
                {showTimeline && (
                  <div className="shrink-0 border-t border-border px-6 py-3">
                    <Timeline board={board} boardDate={bDate} />
                  </div>
                )}
                <StatusBar board={board} boardDate={bDate} />
              </>
            )}
          </main>

          {showTags && (
            <aside className="flex w-[300px] shrink-0 flex-col border-l border-border">
              <div className="flex-1 overflow-y-auto p-5">
                <TagManager />
              </div>
            </aside>
          )}
        </div>
      </div>

      {editingId && (
        <>
          <div
            className="absolute inset-0 z-40 bg-black/30 transition-opacity"
            onClick={() => setEditingId(null)}
          />
          <div className="absolute bottom-2 right-2 top-2 z-50 w-[400px] animate-[slideIn_0.2s_ease-out] overflow-hidden border border-border bg-surface-1 shadow-2xl">
            <TodoDetail />
          </div>
        </>
      )}

      {showSettings && (
        <>
          <div
            className="absolute inset-0 z-40 bg-black/30 transition-opacity"
            onClick={() => setShowSettings(false)}
          />
          <div className="absolute bottom-2 right-2 top-2 z-50 w-[400px] animate-[slideIn_0.2s_ease-out] overflow-hidden border border-border bg-surface-1 shadow-2xl">
            <div className="flex h-full flex-col overflow-hidden">
              <div className="flex items-center justify-between border-b border-border px-5 py-3">
                <h2 className="text-[16px] font-bold">{t("settings.title", locale)}</h2>
                <button
                  type="button"
                  onClick={() => setShowSettings(false)}
                  className="p-1.5 text-text-3 hover:bg-surface-2 hover:text-text-1"
                >
                  ✕
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-5">
                <SettingsPanel />
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default App;
