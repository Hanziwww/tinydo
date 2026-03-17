import { useMemo, useState } from "react";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import { getTodoHistoryDate } from "@/lib/todo-helpers";
import { cn, DIFFICULTY_CONFIG, formatTimeSlots, hexToRgba } from "@/lib/utils";
import { t } from "@/i18n";
import { useTodoStore } from "@/stores/todoStore";
import { useTagStore } from "@/stores/tagStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { TagBadge } from "./TagBadge";

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
            selectedTodos.map((td) => {
              const diff = DIFFICULTY_CONFIG[td.difficulty];
              const todoTags = tags.filter((tg) => td.tagIds.includes(tg.id));
              const time = formatTimeSlots(td.timeSlots);
              return (
                <div
                  key={td.id}
                  className="flex items-start gap-3 border-b border-border/40 py-2.5 pl-2 pr-4 opacity-70"
                >
                  <div className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center border-2 border-success bg-success text-white">
                    <Check size={10} strokeWidth={3} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] leading-snug text-text-1 line-through">{td.title}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <span
                        className="inline-flex items-center gap-1 px-2 py-0.5 text-[13px] font-medium"
                        style={{
                          backgroundColor: hexToRgba(diff.color, 0.08),
                          color: diff.color,
                        }}
                      >
                        <span className="h-1.5 w-1.5" style={{ backgroundColor: diff.color }} />
                        {t(`diff.${td.difficulty}`, locale)}
                      </span>
                      {time && <span className="text-[13px] text-text-3">{time}</span>}
                      {todoTags.map((tg) => (
                        <TagBadge key={tg.id} tag={tg} />
                      ))}
                    </div>
                    {td.subtasks.length > 0 && (
                      <div className="mt-1.5 ml-1 space-y-0.5">
                        {td.subtasks.map((st) => (
                          <div key={st.id} className="flex items-center gap-2">
                            <div
                              className={cn(
                                "flex h-3 w-3 shrink-0 items-center justify-center rounded border",
                                st.completed
                                  ? "border-success bg-success text-white"
                                  : "border-text-3/40",
                              )}
                            >
                              {st.completed && <Check size={7} strokeWidth={2.5} />}
                            </div>
                            <span
                              className={cn(
                                "text-[13px] text-text-2",
                                st.completed && "line-through text-text-3",
                              )}
                            >
                              {st.title}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {!selectedDate && (
        <p className="py-8 text-center text-[14px] text-text-3">
          {t("history.select_date", locale)}
        </p>
      )}
    </div>
  );
}
