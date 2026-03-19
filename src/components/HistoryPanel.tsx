import { useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { getTodoHistoryDate } from "@/lib/todo-helpers";
import { cn, DIFFICULTY_CONFIG, formatTimeSlots, hexToRgba } from "@/lib/utils";
import { t } from "@/i18n";
import { useTodoStore } from "@/stores/todoStore";
import { useTagStore } from "@/stores/tagStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { TagBadge } from "./TagBadge";
import { EventTimelineForDate } from "./EventPanel";
import * as backend from "@/lib/backend";
import type { TinyEvent } from "@/types";

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function toKey(y: number, m: number, d: number) {
  return `${y}-${pad2(m + 1)}-${pad2(d)}`;
}

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfWeek(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}

const WEEKDAYS_ZH = ["日", "一", "二", "三", "四", "五", "六"];
const WEEKDAYS_EN = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

export function HistoryPanel() {
  const locale = useSettingsStore((s) => s.locale);
  const archivedTodos = useTodoStore((s) => s.archivedTodos);
  const tags = useTagStore((s) => s.tags);

  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const archivedByDate = useMemo(() => {
    const map = new Map<string, typeof archivedTodos>();
    for (const td of archivedTodos) {
      const key = getTodoHistoryDate(td);
      const existing = map.get(key);
      if (existing) {
        existing.push(td);
      } else {
        map.set(key, [td]);
      }
    }
    return map;
  }, [archivedTodos]);

  const datesWithData = useMemo(() => new Set(archivedByDate.keys()), [archivedByDate]);

  const daysInMonth = getDaysInMonth(viewYear, viewMonth);
  const firstDay = getFirstDayOfWeek(viewYear, viewMonth);
  const weekdays = locale === "zh" ? WEEKDAYS_ZH : WEEKDAYS_EN;

  const todayKey = toKey(today.getFullYear(), today.getMonth(), today.getDate());

  function prevMonth() {
    if (viewMonth === 0) {
      setViewYear((y) => y - 1);
      setViewMonth(11);
    } else {
      setViewMonth((m) => m - 1);
    }
  }
  function nextMonth() {
    if (viewMonth === 11) {
      setViewYear((y) => y + 1);
      setViewMonth(0);
    } else {
      setViewMonth((m) => m + 1);
    }
  }

  const monthLabel =
    locale === "zh"
      ? `${viewYear}年${viewMonth + 1}月`
      : new Date(viewYear, viewMonth).toLocaleDateString("en-US", {
          month: "long",
          year: "numeric",
        });

  const selectedTodos = selectedDate ? (archivedByDate.get(selectedDate) ?? []) : [];
  const selectedCompletedTodos = selectedTodos.filter(
    (todo) => todo.historyKind !== "dailyProgress",
  );
  const selectedProgressTodos = selectedTodos.filter(
    (todo) => todo.historyKind === "dailyProgress",
  );
  const monthPrefix = `${viewYear}-${pad2(viewMonth + 1)}`;
  const monthTodos = archivedTodos.filter((todo) =>
    getTodoHistoryDate(todo).startsWith(monthPrefix),
  );
  const monthCompletedCount = monthTodos.filter(
    (todo) => todo.historyKind !== "dailyProgress",
  ).length;
  const monthProgressCount = monthTodos.filter(
    (todo) => todo.historyKind === "dailyProgress",
  ).length;
  const monthDaysCount = new Set(monthTodos.map((todo) => getTodoHistoryDate(todo))).size;
  const monthTagStats = useMemo(() => {
    const counts = new Map<string, number>();
    for (const todo of monthTodos) {
      for (const tagId of todo.tagIds) {
        counts.set(tagId, (counts.get(tagId) ?? 0) + 1);
      }
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([tagId, count]) => ({
        tag: tags.find((tag) => tag.id === tagId) ?? null,
        count,
      }))
      .filter((entry) => entry.tag !== null);
  }, [monthTodos, tags]);

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div className="flex flex-col gap-4 px-6 py-4">
      {/* Calendar */}
      <div className="mx-auto w-full max-w-[340px]">
        <div className="mb-3 flex items-center justify-between">
          <button
            type="button"
            onClick={prevMonth}
            className="p-1.5 text-text-3 transition-colors hover:bg-surface-2 hover:text-text-1"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="text-[15px] font-semibold text-text-1">{monthLabel}</span>
          <button
            type="button"
            onClick={nextMonth}
            className="p-1.5 text-text-3 transition-colors hover:bg-surface-2 hover:text-text-1"
          >
            <ChevronRight size={16} />
          </button>
        </div>

        <div className="grid grid-cols-7 gap-px">
          {weekdays.map((wd) => (
            <div key={wd} className="py-1.5 text-center text-[12px] font-medium text-text-3">
              {wd}
            </div>
          ))}
          {cells.map((day, idx) => {
            if (day === null) {
              return <div key={`empty-${idx}`} className="aspect-square" />;
            }
            const key = toKey(viewYear, viewMonth, day);
            const isToday = key === todayKey;
            const hasData = datesWithData.has(key);
            const isSelected = key === selectedDate;

            return (
              <button
                key={key}
                type="button"
                disabled={!hasData}
                onClick={() => setSelectedDate(isSelected ? null : key)}
                className={cn(
                  "relative flex aspect-square items-center justify-center text-[13px] transition-all",
                  hasData
                    ? "cursor-pointer font-medium hover:bg-accent/10"
                    : "cursor-default text-text-3/50",
                  isSelected && "bg-accent text-white hover:bg-accent",
                  isToday && !isSelected && "font-bold text-accent",
                )}
              >
                {day}
                {hasData && !isSelected && (
                  <span className="absolute bottom-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-accent" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        <HistorySummaryCard
          label={t("history.summary.completed", locale)}
          value={monthCompletedCount}
          helper={monthLabel}
        />
        <HistorySummaryCard
          label={t("history.summary.progress", locale)}
          value={monthProgressCount}
          helper={t("history.summary.progress_helper", locale)}
        />
        <HistorySummaryCard
          label={t("history.summary.days", locale)}
          value={monthDaysCount}
          helper={t("history.summary.days_helper", locale)}
        />
      </div>

      {monthTagStats.length > 0 && (
        <div className="space-y-2 border border-border bg-surface-2/40 px-4 py-3">
          <div className="flex items-center justify-between">
            <p className="text-[13px] font-medium text-text-2">{t("history.tags.title", locale)}</p>
            <span className="text-[12px] text-text-3">{monthLabel}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {monthTagStats.map(({ tag, count }) =>
              tag ? (
                <div key={tag.id} className="flex items-center gap-1.5">
                  <TagBadge tag={tag} />
                  <span className="text-[12px] text-text-3">×{count}</span>
                </div>
              ) : null,
            )}
          </div>
        </div>
      )}

      {/* Selected date tasks */}
      {selectedDate && (
        <div className="space-y-1">
          <div className="flex items-center gap-2 pb-1">
            <div className="h-px flex-1 bg-border/50" />
            <span className="text-[12px] font-medium text-text-3">
              {selectedDate} · {selectedTodos.length}{" "}
              {t("status.completed_items", locale, { n: selectedTodos.length })}
            </span>
            <div className="h-px flex-1 bg-border/50" />
          </div>
          {selectedTodos.length === 0 ? (
            <p className="py-6 text-center text-[14px] text-text-3">
              {t("history.no_tasks", locale)}
            </p>
          ) : (
            <div className="space-y-4">
              {selectedCompletedTodos.length > 0 && (
                <div className="space-y-1">
                  <SectionHeader
                    title={t("history.section.completed", locale)}
                    count={selectedCompletedTodos.length}
                  />
                  {selectedCompletedTodos.map((todo) => (
                    <HistoryTodoRow key={todo.id} todo={todo} tags={tags} locale={locale} />
                  ))}
                </div>
              )}
              {selectedProgressTodos.length > 0 && (
                <div className="space-y-1">
                  <SectionHeader
                    title={t("history.section.progress", locale)}
                    count={selectedProgressTodos.length}
                  />
                  {selectedProgressTodos.map((todo) => (
                    <HistoryTodoRow key={todo.id} todo={todo} tags={tags} locale={locale} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {selectedDate && <HistoryEventSection date={selectedDate} todos={archivedTodos} />}

      {!selectedDate && (
        <p className="py-8 text-center text-[14px] text-text-3">
          {t("history.select_date", locale)}
        </p>
      )}
    </div>
  );
}

function HistoryEventSection({
  date,
  todos,
}: {
  date: string;
  todos: ReturnType<typeof useTodoStore.getState>["archivedTodos"];
}) {
  const locale = useSettingsStore((s) => s.locale);
  const [events, setEvents] = useState<TinyEvent[]>([]);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const d = new Date(date + "T00:00:00");
    const dayStartMs = d.getTime();
    const dayEndMs = dayStartMs + 86_400_000;
    backend
      .getEventsForDate(dayStartMs, dayEndMs)
      .then((evts) => setEvents(evts))
      .catch(() => setEvents([]));
  }, [date]);

  const todoTitleMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const td of todos) map.set(td.id, td.title);
    return map;
  }, [todos]);

  if (events.length === 0) return null;

  return (
    <div className="mt-4 space-y-1">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-2 py-1 text-left"
      >
        <div className="h-px flex-1 bg-border/50" />
        <span className="flex items-center gap-1 text-[12px] font-medium text-text-3">
          {t("event.history_section", locale)} · {events.length}
          <ChevronDown
            size={12}
            className={cn("transition-transform", expanded && "rotate-180")}
          />
        </span>
        <div className="h-px flex-1 bg-border/50" />
      </button>
      {expanded && (
        <div className="pl-2">
          <EventTimelineForDate events={events} todoTitleMap={todoTitleMap} />
        </div>
      )}
    </div>
  );
}

function HistorySummaryCard({
  label,
  value,
  helper,
}: {
  label: string;
  value: number;
  helper: string;
}) {
  return (
    <div className="border border-border bg-surface-2/40 px-4 py-3">
      <p className="text-[12px] font-medium uppercase tracking-wide text-text-3">{label}</p>
      <p className="mt-2 text-[24px] font-bold text-text-1">{value}</p>
      <p className="mt-1 text-[12px] text-text-3">{helper}</p>
    </div>
  );
}

function SectionHeader({ title, count }: { title: string; count: number }) {
  return (
    <div className="flex items-center gap-3 pt-1">
      <div className="h-px flex-1 bg-border/50" />
      <span className="text-[12px] font-medium text-text-3">
        {title} · {count}
      </span>
      <div className="h-px flex-1 bg-border/50" />
    </div>
  );
}

function HistoryTodoRow({
  todo,
  tags,
  locale,
}: {
  todo: ReturnType<typeof useTodoStore.getState>["archivedTodos"][number];
  tags: ReturnType<typeof useTagStore.getState>["tags"];
  locale: ReturnType<typeof useSettingsStore.getState>["locale"];
}) {
  const diff = DIFFICULTY_CONFIG[todo.difficulty];
  const todoTags = tags.filter((tag) => todo.tagIds.includes(tag.id));
  const time = formatTimeSlots(todo.timeSlots);
  const kindKey =
    todo.historyKind === "dailyProgress" ? "history.kind.daily_progress" : "history.kind.completed";

  return (
    <div className="flex items-start gap-3 border-b border-border/40 py-2.5 pl-2 pr-4 opacity-75">
      <div className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center border-2 border-success bg-success text-white">
        <Check size={10} strokeWidth={3} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[15px] leading-snug text-text-1 line-through">{todo.title}</p>
          <span className="bg-accent/10 px-2 py-0.5 text-[12px] font-medium text-accent">
            {t(kindKey, locale)}
          </span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <span
            className="inline-flex items-center gap-1 px-2 py-0.5 text-[13px] font-medium"
            style={{
              backgroundColor: hexToRgba(diff.color, 0.08),
              color: diff.color,
            }}
          >
            <span className="h-1.5 w-1.5" style={{ backgroundColor: diff.color }} />
            {t(`diff.${todo.difficulty}`, locale)}
          </span>
          {time && <span className="text-[13px] text-text-3">{time}</span>}
          {todoTags.map((tag) => (
            <TagBadge key={tag.id} tag={tag} />
          ))}
        </div>
        {todo.historyKind === "dailyProgress" && (
          <p className="mt-1 text-[13px] text-text-3">
            {t("history.kind.daily_progress_note", locale)}
          </p>
        )}
        {todo.subtasks.length > 0 && (
          <div className="mt-1.5 ml-1 space-y-0.5">
            {todo.subtasks.map((subtask) => (
              <div key={subtask.id} className="flex items-center gap-2">
                <div
                  className={cn(
                    "flex h-3 w-3 shrink-0 items-center justify-center rounded border",
                    subtask.completed ? "border-success bg-success text-white" : "border-text-3/40",
                  )}
                >
                  {subtask.completed && <Check size={7} strokeWidth={2.5} />}
                </div>
                <span
                  className={cn(
                    "text-[13px] text-text-2",
                    subtask.completed && "line-through text-text-3",
                  )}
                >
                  {subtask.title}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
