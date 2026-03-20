import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getCurrentWindow, LogicalSize, LogicalPosition } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import { motion, AnimatePresence } from "motion/react";
import { AlertTriangle, Calendar, Hash, Search, Settings2, X } from "lucide-react";
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
import { isMobile, isDesktop } from "@/lib/platform";
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
import { NoticeBanner } from "@/components/NoticeBanner";
import { initBackendData, settingsToStore } from "@/lib/init";
import { parseError } from "@/lib/backend";
import type { PlanningBoard } from "@/types";
import { HistoryPanel } from "@/components/HistoryPanel";
import { EventPanel } from "@/components/EventPanel";
import { useEventStore } from "@/stores/eventStore";
import { usePredictStore } from "@/stores/predictStore";
import { useSyncStore } from "@/stores/syncStore";
import { ConflictDialog } from "@/components/sync/ConflictDialog";
import { showInfoNotice } from "@/lib/errorNotice";

const MINI_W = 320;
const MINI_H = 420;
const EASE_OUT_EXPO: [number, number, number, number] = [0.16, 1, 0.3, 1];
const mobile = isMobile();
const ICON_SIZE = mobile ? 18 : 17;
const BTN_PAD = mobile ? "p-2" : "p-1.5";

function SheetHandle({ onClose }: { onClose: () => void }) {
  const startYRef = useRef(0);
  return (
    <div
      className="flex items-center justify-center pb-1 pt-3"
      onTouchStart={(e) => {
        startYRef.current = e.touches[0].clientY;
      }}
      onTouchEnd={(e) => {
        const dy = e.changedTouches[0].clientY - startYRef.current;
        if (dy > 60) onClose();
      }}
    >
      <div className="h-1 w-10 rounded-full bg-text-3/30" />
    </div>
  );
}

function ScrollEdgeWrapper({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [atTop, setAtTop] = useState(true);
  const [atBottom, setAtBottom] = useState(true);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => {
      const { scrollTop, scrollHeight, clientHeight } = el;
      setAtTop(scrollTop <= 2);
      setAtBottom(scrollTop + clientHeight >= scrollHeight - 2);
    };
    check();
    el.addEventListener("scroll", check, { passive: true });
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", check);
      ro.disconnect();
    };
  }, []);

  return (
    <div className="relative min-h-0 flex-1">
      <div ref={ref} className={className}>
        {children}
      </div>
      {!atTop && (
        <div className="pointer-events-none absolute inset-x-0 top-0 h-6 bg-gradient-to-b from-surface-1/80 to-transparent" />
      )}
      {!atBottom && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-6 bg-gradient-to-t from-surface-1/80 to-transparent" />
      )}
    </div>
  );
}

function App() {
  const [showTags, setShowTags] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [board, setBoard] = useState<PlanningBoard>("today");
  const [now, setNow] = useState(() => new Date());
  const [mini, setMini] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
  const [modeTransitioning, setModeTransitioning] = useState(false);
  const [splashDone, setSplashDone] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [focusSignal, setFocusSignal] = useState(0);
  const [searchFocusSignal, setSearchFocusSignal] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const backPressRef = useRef(0);
  const searchOpenRef = useRef(false);
  const showSettingsRef = useRef(false);
  const showTagsRef = useRef(false);

  searchOpenRef.current = searchOpen;
  showSettingsRef.current = showSettings;
  showTagsRef.current = showTags;

  const hydrated = useTodoStore((s) => s._hydrated);
  const theme = useSettingsStore((s) => s.theme);

  useEffect(() => {
    initBackendData()
      .then((data) => {
        useTodoStore.getState()._hydrate(data.todos, data.archivedTodos);
        useTagStore.getState()._hydrate(data.tags, data.tagGroups);
        useSettingsStore.getState()._hydrate(settingsToStore(data.settings));
      })
      .catch((e: unknown) => {
        console.error("Backend init failed:", e);
        setInitError(parseError(e));
      });
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    void usePredictStore.getState().refreshPredictions();
    void useSyncStore
      .getState()
      .hydrate()
      .then(() => {
        if (useSyncStore.getState().configured) {
          void useSyncStore
            .getState()
            .triggerSync()
            .then((result) => {
              if (result && (result.pulled > 0 || result.pushed > 0)) {
                const loc = useSettingsStore.getState().locale;
                const parts: string[] = [];
                if (result.pulled > 0) parts.push(t("sync.pulled", loc, { n: result.pulled }));
                if (result.pushed > 0) parts.push(t("sync.pushed", loc, { n: result.pushed }));
                showInfoNotice(parts.join("，"));
              }
            });
        }
      });
    if (mobile) {
      const ss = useSettingsStore.getState();
      if (ss.timelineStartHour === 0 && ss.timelineEndHour === 24) {
        ss.setTimelineRange(7, 23);
      }
      void import("@tauri-apps/plugin-notification").then(
        ({ isPermissionGranted, requestPermission }) => {
          void isPermissionGranted().then((granted) => {
            if (!granted) void requestPermission();
          });
        },
      );
    }
    const timer = setTimeout(() => setSplashDone(true), 1500);
    return () => {
      clearTimeout(timer);
    };
  }, [hydrated]);

  useEffect(() => {
    if (mobile) return;
    const unlisten = listen("window-restored", () => {
      const el = rootRef.current;
      if (!el) return;
      el.classList.remove("animate-window-appear");
      void el.offsetWidth;
      el.classList.add("animate-window-appear");
      setFocusSignal((value) => value + 1);
    });
    return () => {
      void unlisten.then((f) => f());
    };
  }, []);

  const locale = useSettingsStore((s) => s.locale);
  const showTimeline = useSettingsStore((s) => s.showTimeline);
  const unlockHour = useSettingsStore((s) => s.tomorrowPlanningUnlockHour);
  const userName = useSettingsStore((s) => s.userName);
  const editingId = useTodoStore((s) => s.editingTodoId);
  const setEditingId = useTodoStore((s) => s.setEditingTodoId);
  const todos = useTodoStore((s) => s.todos);
  const viewMode = useTodoStore((s) => s.viewMode);

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

  const closeSearch = useCallback(() => {
    setSearchOpen(false);
    setSearchQuery("");
  }, []);

  const handleMobileScrollableFocus = useCallback((event: React.FocusEvent<HTMLDivElement>) => {
    if (!mobile) return;
    const container = event.currentTarget;
    const target = event.target as HTMLElement;
    if (
      !(
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement
      )
    ) {
      return;
    }
    container.style.scrollPaddingBottom = "160px";
    container.style.paddingBottom = "calc(max(var(--safe-area-bottom), 4px) + 120px)";
    window.setTimeout(() => {
      target.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }, 120);
  }, []);

  const handleMobileScrollableBlur = useCallback((event: React.FocusEvent<HTMLDivElement>) => {
    if (!mobile) return;
    const container = event.currentTarget;
    window.setTimeout(() => {
      const active = document.activeElement;
      if (
        active instanceof HTMLInputElement ||
        active instanceof HTMLTextAreaElement ||
        active instanceof HTMLSelectElement
      ) {
        if (container.contains(active)) return;
      }
      container.style.scrollPaddingBottom = "96px";
      container.style.paddingBottom = "max(var(--safe-area-bottom), 4px)";
    }, 80);
  }, []);

  const openSearch = useCallback(() => {
    if (board === "history") return;
    setSearchOpen(true);
    setSearchFocusSignal((value) => value + 1);
  }, [board]);

  useEffect(() => {
    if (!unlocked && board === "tomorrow") {
      setBoard("today");
    }
  }, [board, unlocked]);

  useEffect(() => {
    if (!searchOpen) return;
    const id = requestAnimationFrame(() => searchInputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [searchOpen, searchFocusSignal]);

  useEffect(() => {
    if (mobile) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") {
        if (board === "history") return;
        event.preventDefault();
        if (searchOpen) closeSearch();
        else openSearch();
        return;
      }

      if (
        event.key === "Escape" &&
        searchOpen &&
        document.activeElement === searchInputRef.current
      ) {
        event.preventDefault();
        closeSearch();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [board, closeSearch, openSearch, searchOpen]);

  // Android back button handling — registered once, reads state via refs/stores
  useEffect(() => {
    if (!mobile) return;
    let cleanup: (() => void) | null = null;
    void import("@tauri-apps/api/app").then(({ onBackButtonPress }) => {
      void onBackButtonPress(() => {
        const currentLocale = useSettingsStore.getState().locale;
        const evtTodoId = useEventStore.getState().eventViewTodoId;
        const curEditId = useTodoStore.getState().editingTodoId;

        if (searchOpenRef.current) {
          closeSearch();
          return;
        }
        if (evtTodoId) {
          useEventStore.getState().setEventViewTodoId(null);
          return;
        }
        if (curEditId) {
          useTodoStore.getState().setEditingTodoId(null);
          return;
        }
        if (showSettingsRef.current) {
          setShowSettings(false);
          return;
        }
        if (showTagsRef.current) {
          setShowTags(false);
          return;
        }

        const ts = Date.now();
        if (ts - backPressRef.current < 2000) {
          void import("@tauri-apps/plugin-process").then(({ exit }) => exit(0));
        } else {
          backPressRef.current = ts;
          showInfoNotice(t("mobile.back_exit_hint", currentLocale));
        }
      }).then((listener) => {
        cleanup = () => void listener.unregister();
      });
    });
    return () => cleanup?.();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- refs are stable

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
    if (mobile) return;
    setModeTransitioning(true);
    await new Promise((r) => setTimeout(r, 150));
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
    await new Promise((r) => requestAnimationFrame(r));
    setModeTransitioning(false);
  }, [miniOnTop, setFullModeRect]);

  const exitMini = useCallback(async () => {
    if (mobile) return;
    setModeTransitioning(true);
    await new Promise((r) => setTimeout(r, 150));
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
    await new Promise((r2) => requestAnimationFrame(r2));
    setModeTransitioning(false);
  }, [setMiniModePosition]);

  if (initError) {
    return (
      <div className="flex h-full items-center justify-center bg-surface-1 text-text-1">
        <p className="text-sm text-red-400">{initError}</p>
      </div>
    );
  }

  const showSplash = !hydrated || !splashDone;
  const logoSrc = theme === "dark" ? "/icons/tinydo-logo-dark.svg" : "/icons/tinydo-logo-light.svg";

  return (
    <div ref={rootRef} className="h-full bg-surface-1">
      <div className="pointer-events-none">
        <NoticeBanner />
      </div>
      <ConflictDialog />
      <AnimatePresence mode="wait">
        {showSplash ? (
          <motion.div
            key="splash"
            className="flex h-full flex-col items-center justify-center"
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3, ease: EASE_OUT_EXPO }}
          >
            <img src={logoSrc} alt="TinyDo" className="splash-logo h-16 w-16" />
            <p className="splash-text mt-4 text-[13px] font-medium tracking-wide text-text-3">
              TinyDo
            </p>
          </motion.div>
        ) : (
          <motion.div
            key="main"
            className="h-full"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4, ease: EASE_OUT_EXPO }}
          >
            <motion.div
              className="h-full"
              initial={false}
              animate={{
                opacity: modeTransitioning ? 0 : 1,
                scale: modeTransitioning ? 0.96 : 1,
              }}
              transition={{
                duration: modeTransitioning ? 0.12 : 0.25,
                ease: EASE_OUT_EXPO,
              }}
            >
              {!mobile && mini ? (
                <div className="mini-mode flex h-full flex-col text-text-1">
                  <div className="mini-mode-inner flex min-h-0 flex-1 flex-col overflow-hidden bg-surface-1">
                    <MiniMode onExpand={exitMini} />
                  </div>
                </div>
              ) : (
                <div
                  className={cn(
                    "relative flex h-full min-h-0 flex-col text-text-1",
                    (isDesktop() || mobile) && "select-none",
                  )}
                >
                  <div
                    className={cn(
                      "flex min-h-0 flex-1 flex-col overflow-hidden bg-surface-1",
                      mobile && "mobile-safe-top mobile-safe-bottom",
                    )}
                  >
                    {isDesktop() && <TitleBar onMiniMode={enterMini} />}

                    <header
                      className={cn(
                        "shrink-0 border-b border-border pb-3 pt-3",
                        mobile ? "px-4" : "px-6",
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <FadeTransition
                          transitionKey={board}
                          className={cn("flex items-baseline gap-3", mobile && "flex-col gap-0.5")}
                        >
                          <h1
                            className={cn(
                              "font-extrabold leading-tight tracking-tight",
                              mobile ? "text-[18px]" : "text-[22px]",
                            )}
                          >
                            {greeting}
                          </h1>
                          <p className={cn("text-text-3", mobile ? "text-[13px]" : "text-[14px]")}>
                            {formatDate(dispDate, locale)}
                          </p>
                        </FadeTransition>
                        <div className="flex items-center gap-1.5">
                          {overdueN > 0 && !mobile && (
                            <span className="flex items-center gap-1.5 bg-warning/10 px-2.5 py-1 text-[13px] font-semibold text-warning">
                              <AlertTriangle size={14} />
                              {t("status.overdue", locale, { n: overdueN })}
                            </span>
                          )}
                          {!unlocked && !mobile && (
                            <span className="bg-surface-2 px-2.5 py-1 text-[13px] text-text-3">
                              {t("planning.unlock_at", locale, {
                                time: formatHourLabel(unlockHour, locale),
                              })}
                            </span>
                          )}
                          {board !== "history" && (
                            <button
                              type="button"
                              onClick={() => {
                                if (searchOpen) closeSearch();
                                else openSearch();
                              }}
                              className={cn(
                                "transition-colors",
                                BTN_PAD,
                                searchOpen
                                  ? "bg-accent-soft text-accent"
                                  : "text-text-3 hover:bg-surface-2 hover:text-text-1",
                              )}
                            >
                              <Search size={ICON_SIZE} />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setShowTags(!showTags)}
                            className={cn(
                              "transition-colors",
                              BTN_PAD,
                              showTags
                                ? "bg-accent-soft text-accent"
                                : "text-text-3 hover:bg-surface-2 hover:text-text-1",
                            )}
                          >
                            <Hash size={ICON_SIZE} />
                          </button>
                          <button
                            type="button"
                            onClick={() => setShowSettings(!showSettings)}
                            className={cn(
                              "transition-colors",
                              BTN_PAD,
                              showSettings
                                ? "bg-accent-soft text-accent"
                                : "text-text-3 hover:bg-surface-2 hover:text-text-1",
                            )}
                          >
                            <Settings2 size={ICON_SIZE} />
                          </button>
                        </div>
                      </div>

                      {mobile && overdueN > 0 && (
                        <div className="mt-1.5 flex items-center gap-1.5 text-[13px] font-semibold text-warning">
                          <AlertTriangle size={13} />
                          {t("status.overdue", locale, { n: overdueN })}
                        </div>
                      )}

                      <div className={cn("flex items-center gap-5", mobile ? "mt-2" : "mt-2.5")}>
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
                          onClick={() => {
                            closeSearch();
                            setBoard("history");
                          }}
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
                              focusSignal={focusSignal}
                            />
                          </div>
                          <TagFilter />
                          <AnimatePresence>
                            {searchOpen && (
                              <motion.div
                                key="search-bar"
                                initial={{ opacity: 0, height: 0, marginTop: 0 }}
                                animate={{ opacity: 1, height: "auto", marginTop: 10 }}
                                exit={{ opacity: 0, height: 0, marginTop: 0 }}
                                transition={{ duration: 0.2, ease: EASE_OUT_EXPO }}
                                className="overflow-hidden"
                              >
                                <div
                                  className={cn(
                                    "flex items-center gap-3 border border-border bg-surface-2/60 px-3",
                                    mobile ? "py-2.5" : "py-2",
                                  )}
                                >
                                  <Search size={15} className="shrink-0 text-text-3" />
                                  <input
                                    ref={searchInputRef}
                                    type="text"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder={t("search.placeholder", locale)}
                                    className="min-w-0 flex-1 bg-transparent text-[14px] text-text-1 outline-none placeholder:text-text-3"
                                  />
                                  {searchQuery.trim() && (
                                    <button
                                      type="button"
                                      onClick={() => setSearchQuery("")}
                                      className="shrink-0 p-1 text-[13px] text-text-3 transition-colors hover:text-text-1"
                                    >
                                      {t("search.clear", locale)}
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={closeSearch}
                                    className="shrink-0 p-1 text-text-3 transition-colors hover:text-text-1"
                                  >
                                    <X size={14} />
                                  </button>
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </>
                      )}
                    </header>

                    <div className="flex min-h-0 flex-1">
                      <main className="flex min-w-0 flex-1 flex-col">
                        {board === "history" ? (
                          <FadeTransition
                            transitionKey="history"
                            className="min-h-0 flex-1 overflow-y-auto"
                          >
                            <HistoryPanel />
                          </FadeTransition>
                        ) : (
                          <>
                            {mobile ? (
                              <ScrollEdgeWrapper className="h-full overflow-y-auto">
                                <FadeTransition transitionKey={`${board}-${viewMode}`}>
                                  <TodoList
                                    board={board}
                                    boardDate={bDate}
                                    searchQuery={searchQuery}
                                  />
                                </FadeTransition>
                              </ScrollEdgeWrapper>
                            ) : (
                              <FadeTransition
                                transitionKey={`${board}-${viewMode}`}
                                className="min-h-0 flex-1 overflow-y-auto"
                              >
                                <TodoList
                                  board={board}
                                  boardDate={bDate}
                                  searchQuery={searchQuery}
                                />
                              </FadeTransition>
                            )}
                            {showTimeline && (
                              <div
                                className={cn(
                                  "shrink-0 border-t border-border py-3",
                                  mobile ? "px-4" : "px-6",
                                )}
                              >
                                <Timeline
                                  board={board}
                                  boardDate={bDate}
                                  searchQuery={searchQuery}
                                />
                              </div>
                            )}
                            <StatusBar board={board} boardDate={bDate} searchQuery={searchQuery} />
                          </>
                        )}
                      </main>

                      {isDesktop() && (
                        <AnimatePresence>
                          {showTags && (
                            <motion.aside
                              key="tag-sidebar"
                              className="flex shrink-0 flex-col overflow-hidden border-l border-border"
                              initial={{ width: 0, opacity: 0 }}
                              animate={{ width: 300, opacity: 1 }}
                              exit={{ width: 0, opacity: 0 }}
                              transition={{ duration: 0.25, ease: EASE_OUT_EXPO }}
                            >
                              <div className="w-[300px] flex-1 overflow-y-auto p-5">
                                <TagManager />
                              </div>
                            </motion.aside>
                          )}
                        </AnimatePresence>
                      )}
                    </div>
                  </div>

                  {/* Detail panel */}
                  <AnimatePresence>
                    {editingId && (
                      <motion.div
                        key="detail-backdrop"
                        className="absolute inset-0 z-40 bg-black/30"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        onClick={() => setEditingId(null)}
                      />
                    )}
                  </AnimatePresence>
                  <AnimatePresence>
                    {editingId &&
                      (mobile ? (
                        <motion.div
                          key="detail-panel"
                          className="absolute inset-0 z-50 flex flex-col overflow-hidden bg-surface-1 mobile-safe-top mobile-safe-bottom"
                          initial={{ y: "100%" }}
                          animate={{ y: 0 }}
                          exit={{ y: "100%" }}
                          transition={{ duration: 0.35, ease: EASE_OUT_EXPO }}
                        >
                          <SheetHandle onClose={() => setEditingId(null)} />
                          <div className="min-h-0 flex-1 overflow-hidden">
                            <TodoDetail />
                          </div>
                        </motion.div>
                      ) : (
                        <motion.div
                          key="detail-panel"
                          className="absolute bottom-2 right-2 top-2 z-50 w-[400px] overflow-hidden border border-border bg-surface-1 shadow-2xl"
                          initial={{ x: "100%", opacity: 0 }}
                          animate={{ x: 0, opacity: 1 }}
                          exit={{ x: "100%", opacity: 0 }}
                          transition={{ duration: 0.25, ease: EASE_OUT_EXPO }}
                        >
                          <TodoDetail />
                        </motion.div>
                      ))}
                  </AnimatePresence>

                  <EventPanelOverlay />

                  {/* Settings panel */}
                  <AnimatePresence>
                    {showSettings && (
                      <motion.div
                        key="settings-backdrop"
                        className="absolute inset-0 z-40 bg-black/30"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        onClick={() => setShowSettings(false)}
                      />
                    )}
                  </AnimatePresence>
                  <AnimatePresence>
                    {showSettings &&
                      (mobile ? (
                        <motion.div
                          key="settings-panel"
                          className="absolute inset-0 z-50 flex flex-col overflow-hidden bg-surface-1 mobile-safe-top mobile-safe-bottom"
                          initial={{ y: "100%" }}
                          animate={{ y: 0 }}
                          exit={{ y: "100%" }}
                          transition={{ duration: 0.35, ease: EASE_OUT_EXPO }}
                        >
                          <SheetHandle onClose={() => setShowSettings(false)} />
                          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                            <div className="flex items-center justify-between border-b border-border px-5 py-2">
                              <h2 className="text-[16px] font-bold">
                                {t("settings.title", locale)}
                              </h2>
                              <button
                                type="button"
                                onClick={() => setShowSettings(false)}
                                className="p-2 text-text-3 hover:bg-surface-2 hover:text-text-1"
                              >
                                <X size={18} />
                              </button>
                            </div>
                            <div
                              className="flex-1 overflow-y-auto p-5"
                              style={{
                                scrollPaddingBottom: 96,
                                paddingBottom: "max(var(--safe-area-bottom), 4px)",
                              }}
                              onFocusCapture={handleMobileScrollableFocus}
                              onBlurCapture={handleMobileScrollableBlur}
                            >
                              <SettingsPanel />
                            </div>
                          </div>
                        </motion.div>
                      ) : (
                        <motion.div
                          key="settings-panel"
                          className="absolute bottom-2 right-2 top-2 z-50 w-[400px] overflow-hidden border border-border bg-surface-1 shadow-2xl"
                          initial={{ x: "100%", opacity: 0 }}
                          animate={{ x: 0, opacity: 1 }}
                          exit={{ x: "100%", opacity: 0 }}
                          transition={{ duration: 0.25, ease: EASE_OUT_EXPO }}
                        >
                          <div className="flex h-full flex-col overflow-hidden">
                            <div className="flex items-center justify-between border-b border-border px-5 py-3">
                              <h2 className="text-[16px] font-bold">
                                {t("settings.title", locale)}
                              </h2>
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
                        </motion.div>
                      ))}
                  </AnimatePresence>

                  {/* Mobile tag manager sheet */}
                  {mobile && (
                    <>
                      <AnimatePresence>
                        {showTags && (
                          <motion.div
                            key="tags-backdrop"
                            className="absolute inset-0 z-40 bg-black/30"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            onClick={() => setShowTags(false)}
                          />
                        )}
                      </AnimatePresence>
                      <AnimatePresence>
                        {showTags && (
                          <motion.div
                            key="tags-panel"
                            className="absolute inset-0 z-50 flex flex-col overflow-hidden bg-surface-1 mobile-safe-top mobile-safe-bottom"
                            initial={{ y: "100%" }}
                            animate={{ y: 0 }}
                            exit={{ y: "100%" }}
                            transition={{ duration: 0.35, ease: EASE_OUT_EXPO }}
                          >
                            <SheetHandle onClose={() => setShowTags(false)} />
                            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                              <div className="flex items-center justify-between border-b border-border px-5 py-2">
                                <h2 className="text-[16px] font-bold">{t("tag.manage", locale)}</h2>
                                <button
                                  type="button"
                                  onClick={() => setShowTags(false)}
                                  className="p-2 text-text-3 hover:bg-surface-2 hover:text-text-1"
                                >
                                  <X size={18} />
                                </button>
                              </div>
                              <div
                                className="flex-1 overflow-y-auto p-5"
                                style={{
                                  scrollPaddingBottom: 96,
                                  paddingBottom: "max(var(--safe-area-bottom), 4px)",
                                }}
                                onFocusCapture={handleMobileScrollableFocus}
                                onBlurCapture={handleMobileScrollableBlur}
                              >
                                <TagManager />
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </>
                  )}
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function EventPanelOverlay() {
  const eventViewTodoId = useEventStore((s) => s.eventViewTodoId);
  const setEventViewTodoId = useEventStore((s) => s.setEventViewTodoId);
  const editingId = useTodoStore((s) => s.editingTodoId);
  const setEditingId = useTodoStore((s) => s.setEditingTodoId);

  useEffect(() => {
    if (eventViewTodoId && editingId) {
      setEditingId(null);
    }
  }, [eventViewTodoId, editingId, setEditingId]);

  return (
    <>
      {eventViewTodoId && (
        <div
          className="absolute inset-0 z-40 bg-black/30"
          onClick={() => setEventViewTodoId(null)}
        />
      )}
      <AnimatePresence>
        {eventViewTodoId &&
          (mobile ? (
            <motion.div
              key="event-panel"
              className="absolute inset-0 z-50 flex flex-col overflow-hidden bg-surface-1 mobile-safe-top mobile-safe-bottom"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ duration: 0.35, ease: EASE_OUT_EXPO }}
            >
              <SheetHandle onClose={() => setEventViewTodoId(null)} />
              <div className="min-h-0 flex-1 overflow-hidden">
                <EventPanel />
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="event-panel"
              className="absolute bottom-2 right-2 top-2 z-50 w-[400px] overflow-hidden border border-border bg-surface-1 shadow-2xl"
              initial={{ x: "100%", opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: "100%", opacity: 0 }}
              transition={{ duration: 0.25, ease: EASE_OUT_EXPO }}
            >
              <EventPanel />
            </motion.div>
          ))}
      </AnimatePresence>
    </>
  );
}

export default App;
