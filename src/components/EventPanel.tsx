import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { t } from "@/i18n";
import { useEventStore } from "@/stores/eventStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useTagStore } from "@/stores/tagStore";
import { useTodoStore } from "@/stores/todoStore";
import * as backend from "@/lib/backend";
import type { TinyEvent, EventType, Locale } from "@/types";

const EVENT_ICONS: Record<EventType, string> = {
  created: "✦",
  titleChanged: "✎",
  tagAdded: "+#",
  tagRemoved: "−#",
  difficultyChanged: "◆",
  timeSlotAdded: "+⏰",
  timeSlotRemoved: "−⏰",
  timeSlotChanged: "⏰",
  reminderChanged: "🔔",
  subtaskAdded: "+☐",
  subtaskRemoved: "−☐",
  subtaskToggled: "☑",
  subtaskRenamed: "☐✎",
  relationAdded: "+↗",
  relationRemoved: "−↗",
  completed: "✓",
  uncompleted: "↩",
  movedToTomorrow: "→",
  dateChanged: "📅",
  durationChanged: "⏱",
  duplicated: "⧉",
  archived: "📦",
  deleted: "🗑",
};

const EVENT_DOT_COLORS: Record<string, string> = {
  created: "#6366f1",
  completed: "#22c55e",
  uncompleted: "#f59e0b",
  deleted: "#ef4444",
  archived: "#8b5cf6",
  duplicated: "#06b6d4",
};

function getEventLabel(eventType: EventType, locale: Locale): string {
  return t(`event.${eventType}`, locale);
}

function formatTimestamp(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
}

function formatTimeSlotValue(value: unknown): string | null {
  if (typeof value !== "object" || value === null) return null;
  const obj = value as Record<string, unknown>;
  const start = obj.start as string | undefined;
  const end = obj.end as string | undefined | null;
  if (!start) return null;
  return end ? `${start} - ${end}` : start;
}

function formatReminderValue(value: unknown, locale: Locale): string | null {
  if (value === null || value === undefined) return t("detail.reminder_off", locale);
  const mins = Number(value);
  if (isNaN(mins)) return typeof value === "string" ? value : `${Number(value)}`;
  if (mins === 0) return t("detail.reminder_at_time", locale);
  if (mins >= 1440) return t("detail.reminder_day_before", locale);
  if (mins >= 60 && mins % 60 === 0) return t("detail.reminder_hours", locale, { n: mins / 60 });
  return t("detail.reminder_mins", locale, { n: mins });
}

function formatEventValue(
  value: unknown,
  eventType: EventType,
  tagNameMap: Map<string, string>,
  todoTitleMap: Map<string, string>,
  locale: Locale,
): string | null {
  if (value === null || value === undefined) return null;

  if ((eventType === "tagAdded" || eventType === "tagRemoved") && typeof value === "string") {
    return tagNameMap.get(value) ?? value;
  }

  if (
    (eventType === "relationAdded" || eventType === "relationRemoved") &&
    typeof value === "object"
  ) {
    const obj = value as Record<string, unknown>;
    const relType = obj.relationType as string | undefined;
    const targetId = obj.targetTaskId as string | undefined;
    const relLabel = relType ? t(`relation.short.${relType}`, locale) : "";
    const targetLabel = targetId ? (todoTitleMap.get(targetId) ?? targetId.slice(0, 8)) : "";
    if (relLabel && targetLabel) return `${relLabel}: ${targetLabel}`;
    if (relLabel) return relLabel;
    if (targetLabel) return targetLabel;
    return null;
  }

  if (
    eventType === "timeSlotChanged" ||
    eventType === "timeSlotAdded" ||
    eventType === "timeSlotRemoved"
  ) {
    const formatted = formatTimeSlotValue(value);
    if (formatted) return formatted;
    if (typeof value === "string") return value;
    return null;
  }

  if (eventType === "reminderChanged") {
    return formatReminderValue(value, locale);
  }

  if (eventType === "difficultyChanged") {
    const n = Number(value);
    if (!isNaN(n) && n >= 1 && n <= 4) return t(`diff.${n}`, locale);
    return typeof value === "string" ? value : `${Number(value)}`;
  }

  if (eventType === "durationChanged") {
    const n = Number(value);
    if (!isNaN(n)) return locale === "zh" ? `${n} 天` : `${n} day${n > 1 ? "s" : ""}`;
    return typeof value === "string" ? value : `${Number(value)}`;
  }

  if (eventType === "subtaskToggled") {
    if (typeof value === "boolean") {
      return value
        ? locale === "zh"
          ? "已完成"
          : "Done"
        : locale === "zh"
          ? "未完成"
          : "Not done";
    }
  }

  if (
    (eventType === "subtaskAdded" ||
      eventType === "subtaskRemoved" ||
      eventType === "subtaskRenamed" ||
      eventType === "subtaskToggled") &&
    typeof value === "object"
  ) {
    const obj = value as Record<string, unknown>;
    if (typeof obj.title === "string") return obj.title;
  }

  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return `${value}`;

  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const meaningful = Object.entries(obj)
      .filter(([, v]) => v !== null && v !== undefined)
      .map(([k, v]) => `${k}: ${v}`)
      .join(", ");
    return meaningful || null;
  }

  return null;
}

function ValueDisplay({ value, label }: { value: string | null; label: string }) {
  if (!value) return null;
  return (
    <span className="inline-flex items-center gap-1.5 rounded bg-surface-3/60 px-2 py-1 text-[12px] text-text-2">
      <span className="text-text-3">{label}</span>
      <span className="max-w-[180px] truncate font-medium">{value}</span>
    </span>
  );
}

function EventRow({ event, locale }: { event: TinyEvent; locale: Locale }) {
  const tags = useTagStore((s) => s.tags);
  const todos = useTodoStore((s) => s.todos);
  const tagNameMap = new Map(tags.map((tg) => [tg.id, tg.name]));
  const todoTitleMap = new Map(todos.map((td) => [td.id, td.title]));
  const dotColor =
    (EVENT_DOT_COLORS as Record<string, string | undefined>)[event.eventType] ??
    "var(--color-text-3)";
  return (
    <div className="relative flex gap-3.5 py-3 pl-6">
      <div
        className="absolute left-0 top-[16px] h-2.5 w-2.5 rounded-full"
        style={{ backgroundColor: dotColor }}
      />
      <div className="absolute bottom-0 left-[4px] top-[26px] w-px bg-border/60" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2.5">
          <span className="text-[14px] leading-none">
            {(EVENT_ICONS as Record<string, string | undefined>)[event.eventType] ?? "•"}
          </span>
          <span className="text-[15px] font-medium leading-snug text-text-1">
            {getEventLabel(event.eventType, locale)}
          </span>
        </div>
        <div className="mt-1 text-[13px] text-text-3">{formatTimestamp(event.timestamp)}</div>
        {(event.oldValue !== null || event.newValue !== null) && (
          <div className="mt-2 flex flex-wrap gap-2">
            <ValueDisplay
              value={formatEventValue(
                event.oldValue,
                event.eventType,
                tagNameMap,
                todoTitleMap,
                locale,
              )}
              label="←"
            />
            <ValueDisplay
              value={formatEventValue(
                event.newValue,
                event.eventType,
                tagNameMap,
                todoTitleMap,
                locale,
              )}
              label="→"
            />
          </div>
        )}
      </div>
    </div>
  );
}

export function EventPanel() {
  const locale = useSettingsStore((s) => s.locale);
  const eventViewTodoId = useEventStore((s) => s.eventViewTodoId);
  const setEventViewTodoId = useEventStore((s) => s.setEventViewTodoId);
  const [eventsData, setEventsData] = useState<{ todoId: string; events: TinyEvent[] } | null>(
    null,
  );
  const fetchIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!eventViewTodoId) return;
    let cancelled = false;
    fetchIdRef.current = eventViewTodoId;
    backend
      .getEventsForTodo(eventViewTodoId)
      .then((evts) => {
        if (!cancelled) setEventsData({ todoId: eventViewTodoId, events: evts });
      })
      .catch(() => {
        if (!cancelled) setEventsData({ todoId: eventViewTodoId, events: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [eventViewTodoId]);

  const loading = eventViewTodoId !== null && eventsData?.todoId !== eventViewTodoId;
  const events = eventsData?.todoId === eventViewTodoId ? eventsData.events : [];

  if (!eventViewTodoId) return null;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <h2 className="text-[16px] font-bold leading-tight text-text-1">
          {t("event.panel_title", locale)}
        </h2>
        <button
          type="button"
          onClick={() => setEventViewTodoId(null)}
          className="shrink-0 p-1.5 text-text-3 hover:bg-surface-2 hover:text-text-1"
        >
          <X size={16} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4">
        {loading ? (
          <div className="py-10 text-center text-[14px] text-text-3">
            {t("event.loading", locale)}
          </div>
        ) : events.length === 0 ? (
          <div className="py-10 text-center text-[14px] text-text-3">
            {t("event.empty", locale)}
          </div>
        ) : (
          <div className="space-y-0">
            {events.map((evt, i) => (
              <div
                key={evt.id}
                className={cn(i === events.length - 1 && "[&_.absolute.bottom-0]:hidden")}
              >
                <EventRow event={evt} locale={locale} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function EventTimelineForDate({
  events,
  todoTitleMap,
}: {
  events: TinyEvent[];
  todoTitleMap: Map<string, string>;
}) {
  const locale = useSettingsStore((s) => s.locale);

  if (events.length === 0) return null;

  return (
    <div className="space-y-0">
      {events.map((evt, i) => (
        <div
          key={evt.id}
          className={cn(i === events.length - 1 && "[&_.absolute.bottom-0]:hidden")}
        >
          <div className="relative flex gap-3.5 py-2.5 pl-6">
            <div
              className="absolute left-0 top-[14px] h-2.5 w-2.5 rounded-full"
              style={{
                backgroundColor:
                  (EVENT_DOT_COLORS as Record<string, string | undefined>)[evt.eventType] ??
                  "var(--color-text-3)",
              }}
            />
            <div className="absolute bottom-0 left-[4px] top-[24px] w-px bg-border/60" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2.5">
                <span className="text-[13px] leading-none">
                  {(EVENT_ICONS as Record<string, string | undefined>)[evt.eventType] ?? "•"}
                </span>
                <span className="text-[13px] font-medium text-text-1">
                  {getEventLabel(evt.eventType, locale)}
                </span>
                <span className="max-w-[180px] truncate text-[12px] text-text-3">
                  {todoTitleMap.get(evt.todoId) ?? evt.todoId}
                </span>
              </div>
              <div className="mt-0.5 text-[12px] text-text-3">{formatTimestamp(evt.timestamp)}</div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
