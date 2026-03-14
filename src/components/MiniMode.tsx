import { useEffect, useMemo, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Check, ChevronRight, Maximize2, Pin, PinOff, X } from "lucide-react";
import { cn, formatTime, getOverdueDays, getTodayDateKey, DIFFICULTY_CONFIG } from "@/lib/utils";
import { t } from "@/i18n";
import { useTodoStore } from "@/stores/todoStore";
import { useSettingsStore } from "@/stores/settingsStore";
import type { Difficulty } from "@/types";

interface Props {
  onExpand: () => void;
}

export function MiniMode({ onExpand }: Props) {
  const win = getCurrentWindow();
  const locale = useSettingsStore((s) => s.locale);
  const theme = useSettingsStore((s) => s.theme);
  const enableSubtasks = useSettingsStore((s) => s.enableSubtasks);
  const userName = useSettingsStore((s) => s.userName);
  const alwaysOnTop = useSettingsStore((s) => s.miniAlwaysOnTop);
  const setAlwaysOnTop = useSettingsStore((s) => s.setMiniAlwaysOnTop);
  const fadeOnBlur = useSettingsStore((s) => s.miniFadeOnBlur);
  const fadeOpacity = useSettingsStore((s) => s.miniFadeOpacity);
  const todos = useTodoStore((s) => s.todos);
  const toggle = useTodoStore((s) => s.toggleTodo);
  const toggleSubtask = useTodoStore((s) => s.toggleSubtask);
  const todayK = getTodayDateKey();
  const [focused, setFocused] = useState(true);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const activeTodos = useMemo(
    () =>
      todos
        .filter((td) => {
          if (td.completed) return false;
          return td.targetDate <= todayK;
        })
        .sort((a, b) => a.order - b.order),
    [todos, todayK],
  );

  const overdueTodos = useMemo(
    () => activeTodos.filter((td) => getOverdueDays(td.targetDate, todayK) > 0),
    [activeTodos, todayK],
  );
  const todayTodos = useMemo(
    () => activeTodos.filter((td) => getOverdueDays(td.targetDate, todayK) === 0),
    [activeTodos, todayK],
  );
  const overdueN = overdueTodos.length;

  useEffect(() => {
    const onFocus = () => setFocused(true);
    const onBlur = () => setFocused(false);
    window.addEventListener("focus", onFocus);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  const isTransparent = fadeOnBlur && !focused;
  useEffect(() => {
    if (isTransparent) {
      document.body.classList.add("mini-transparent");
    } else {
      document.body.classList.remove("mini-transparent");
    }
    return () => document.body.classList.remove("mini-transparent");
  }, [isTransparent]);

  const togglePin = async () => {
    const next = !alwaysOnTop;
    setAlwaysOnTop(next);
    await win.setAlwaysOnTop(next);
  };

  const containerOpacity = fadeOnBlur && !focused ? fadeOpacity : 1;

  const renderTask = (td: (typeof activeTodos)[0], isOverdue: boolean, todayIndex?: number) => {
    const diff = DIFFICULTY_CONFIG[td.difficulty as Difficulty];
    const od = getOverdueDays(td.targetDate, todayK);
    const time = td.timeStart
      ? td.timeEnd
        ? `${formatTime(td.timeStart)}-${formatTime(td.timeEnd)}`
        : formatTime(td.timeStart)
      : null;
    const subs = td.subtasks ?? [];
    const hasSubs = enableSubtasks && subs.length > 0;
    const expanded = expandedIds.has(td.id);
    const doneCount = subs.filter((st) => st.completed).length;

    return (
      <div
        key={td.id}
        className={cn(
          "relative border-b border-border/30 px-4 py-2.5",
          isOverdue && "bg-warning/[0.04]",
        )}
      >
        <span
          className="absolute left-0 inset-y-0 w-[3px]"
          style={{
            backgroundColor: isOverdue ? "var(--color-warning)" : "var(--color-accent)",
            opacity: isOverdue
              ? Math.max(
                  0.3,
                  1 - (overdueTodos.indexOf(td) * 0.7) / Math.max(overdueTodos.length - 1, 1),
                )
              : todayIndex !== undefined
                ? Math.max(0.1, 1 - todayIndex * (0.9 / Math.max(todayTodos.length - 1, 1)))
                : 0.5,
          }}
        />
        <div className="flex items-start gap-3">
          <button
            type="button"
            onClick={() => {
              const dur = td.durationDays ?? 1;
              toggle(td.id, dur > 1 ? todayK : undefined);
            }}
            className={cn(
              "mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded border-2 transition-colors hover:border-accent",
              isOverdue ? "border-warning/50" : "border-text-3/50",
            )}
          >
            <Check size={0} />
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="text-[16px] leading-snug text-text-1">{td.title}</p>
              {hasSubs && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setExpandedIds((prev) => {
                      const next = new Set(prev);
                      if (next.has(td.id)) next.delete(td.id);
                      else next.add(td.id);
                      return next;
                    });
                  }}
                  className={cn(
                    "flex shrink-0 items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[12px] transition-colors",
                    "text-text-3 hover:bg-surface-3 hover:text-text-2",
                  )}
                >
                  <ChevronRight
                    size={14}
                    className={cn("transition-transform duration-150", expanded && "rotate-90")}
                  />
                  <span className="tabular-nums">
                    {t("subtask.count", locale, { done: doneCount, total: subs.length })}
                  </span>
                </button>
              )}
            </div>
            <div className="mt-1 flex items-center gap-2">
              <span className="text-[13px] font-medium" style={{ color: diff.color }}>
                {t(`diff.${td.difficulty}`, locale)}
              </span>
              {od > 0 && (
                <span className="text-[13px] font-bold text-warning">
                  {t("task.overdue", locale, { n: od })}
                </span>
              )}
              {time && <span className="text-[13px] text-text-3">{time}</span>}
            </div>
          </div>
        </div>

        {hasSubs && (
          <div
            className={cn("grid subtask-expand", expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}
          >
            <div className="min-h-0 overflow-hidden">
              <div className="mt-2 ml-7 space-y-1">
                {subs.map((st) => (
                  <div key={st.id} className="flex items-center gap-2 rounded-md py-1 pr-1">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleSubtask(td.id, st.id);
                      }}
                      className={cn(
                        "flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border",
                        st.completed ? "border-success bg-success text-white" : "border-text-3/50",
                      )}
                    >
                      {st.completed && <Check size={8} strokeWidth={2.5} />}
                    </button>
                    <span
                      className={cn(
                        "min-w-0 flex-1 text-[14px] text-text-2",
                        st.completed && "line-through text-text-3",
                      )}
                    >
                      {st.title}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      className="flex h-full select-none flex-col bg-surface-1 text-text-1"
      style={{ opacity: containerOpacity, transition: "opacity 0.25s ease" }}
    >
      <div
        className="flex h-10 shrink-0 items-center justify-between border-b border-border px-4"
        onMouseDown={() => win.startDragging()}
      >
        <div className="flex items-center gap-2">
          <img
            src={theme === "dark" ? "/icons/tinydo-logo-dark.svg" : "/icons/tinydo-logo-light.svg"}
            alt="TinyDo"
            className="h-5 w-5 shrink-0"
          />
          <span className="text-[15px] font-bold text-text-2">
            {userName || "TinyDo"} · {activeTodos.length}
            {overdueN > 0 && <span className="ml-1 text-warning">⚠{overdueN}</span>}
          </span>
        </div>
        <div className="flex items-center" onMouseDown={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={togglePin}
            className={cn(
              "flex h-8 w-8 items-center justify-center transition-colors",
              alwaysOnTop ? "text-accent" : "text-text-3 hover:text-text-2",
            )}
            title={alwaysOnTop ? "取消置顶" : "置顶"}
          >
            {alwaysOnTop ? <Pin size={15} /> : <PinOff size={15} />}
          </button>
          <button
            type="button"
            onClick={onExpand}
            className="flex h-8 w-8 items-center justify-center text-text-3 transition-colors hover:text-text-1"
            title={t("mini.expand", locale)}
          >
            <Maximize2 size={15} />
          </button>
          <button
            type="button"
            onClick={() => win.close()}
            className="flex h-8 w-8 items-center justify-center text-text-3 transition-colors hover:bg-danger hover:text-white"
          >
            <X size={15} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {activeTodos.length === 0 ? (
          <div className="flex items-center justify-center py-10 text-[16px] text-text-3">
            {t("todo.empty", locale)} ✨
          </div>
        ) : (
          <>
            {overdueTodos.length > 0 && (
              <div>
                <div className="flex items-center gap-2 px-4 pt-2.5 pb-1">
                  <span className="h-px flex-1 bg-warning/30" />
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-warning">
                    {t("mini.overdue", locale)}
                  </span>
                  <span className="h-px flex-1 bg-warning/30" />
                </div>
                {overdueTodos.map((td) => renderTask(td, true))}
              </div>
            )}
            {todayTodos.length > 0 && (
              <div>
                {overdueTodos.length > 0 && (
                  <div className="flex items-center gap-2 px-4 pt-2 pb-1">
                    <span className="h-px flex-1 bg-border/50" />
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-text-3">
                      {t("mini.today", locale)}
                    </span>
                    <span className="h-px flex-1 bg-border/50" />
                  </div>
                )}
                {todayTodos.map((td, i) => renderTask(td, false, i))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
