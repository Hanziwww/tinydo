import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, Plus } from "lucide-react";
import { t } from "@/i18n";
import { isMobile } from "@/lib/platform";
import { isTodoArchivedForDate, isTodoCompletedForDate } from "@/lib/todo-helpers";
import { useSettingsStore } from "@/stores/settingsStore";
import { useTodoStore } from "@/stores/todoStore";
import { useTagStore } from "@/stores/tagStore";
import {
  cn,
  getTodayDateKey,
  hexToRgba,
  shiftDateKey,
  timeToMinutes,
  minutesToTime,
} from "@/lib/utils";
import type { PlanningBoard, TimeSlot } from "@/types";

const mobile = isMobile();

interface Props {
  board: PlanningBoard;
  boardDate: string;
  searchQuery: string;
}

const SNAP = 5;
const snap = (m: number) => Math.round(m / SNAP) * SNAP;

export function Timeline({ board, boardDate, searchQuery }: Props) {
  const locale = useSettingsStore((s) => s.locale);
  const startHour = useSettingsStore((s) => s.timelineStartHour);
  const endHour = useSettingsStore((s) => s.timelineEndHour);
  const [open, setOpen] = useState(true);
  const [nowMin, setNowMin] = useState(() => {
    const d = new Date();
    return d.getHours() * 60 + d.getMinutes();
  });
  const todos = useTodoStore((s) => s.todos);
  const addTimelineTodo = useTodoStore((s) => s.addTimelineTodo);
  const updateTimeSlot = useTodoStore((s) => s.updateTimeSlot);
  const setEditingId = useTodoStore((s) => s.setEditingTodoId);
  const tags = useTagStore((s) => s.tags);
  const todayK = getTodayDateKey();
  const barRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [tooltip, setTooltip] = useState<{ text: string; x: number; y: number } | null>(null);
  const [hoverQuickAdd, setHoverQuickAdd] = useState<{
    left: number;
    start: string;
    end: string | null;
    label: string;
  } | null>(null);
  const [drag, setDrag] = useState<{
    todoId: string;
    slotId: string;
    edge: "start" | "end" | "point";
    origStart: number;
    origEnd: number | null;
    startX: number;
  } | null>(null);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const id = setInterval(() => {
      const d = new Date();
      setNowMin(d.getHours() * 60 + d.getMinutes());
    }, 30_000);
    return () => clearInterval(id);
  }, []);

  const clearHoverQuickAdd = useCallback(() => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    setHoverQuickAdd(null);
  }, []);

  useEffect(() => {
    return () => {
      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    };
  }, []);

  const START = startHour * 60;
  const END = endHour * 60;
  const RANGE = END - START;

  const refDate = board === "today" ? todayK : boardDate;
  const items = todos.filter((td) => {
    const query = searchQuery.trim().toLowerCase();
    const dur = td.durationDays;
    const endDate = shiftDateKey(td.targetDate, dur - 1);
    const inB = td.targetDate <= refDate && endDate >= refDate;
    const matchesQuery = query.length === 0 || td.title.toLowerCase().includes(query);
    return inB && !isTodoArchivedForDate(td, refDate) && td.timeSlots.length > 0 && matchesQuery;
  });

  const color = (ids: string[]) => tags.find((tg) => ids.includes(tg.id))?.color ?? "#6366f1";
  const pct = (m: number) => ((Math.max(START, Math.min(END, m)) - START) / RANGE) * 100;
  const hours: number[] = [];
  for (let h = startHour; h <= endHour; h++) hours.push(h);

  const nowPct = pct(nowMin);
  const showNow = board === "today" && nowMin >= START && nowMin <= END;
  const nowLabel = `${String(Math.floor(nowMin / 60)).padStart(2, "0")}:${String(nowMin % 60).padStart(2, "0")}`;
  const nowLabelAlign = nowPct > 94 ? "end" : nowPct < 6 ? "start" : "center";

  const onPointerDown = useCallback(
    (e: React.PointerEvent, todoId: string, slotId: string, edge: "start" | "end" | "point") => {
      e.stopPropagation();
      e.preventDefault();
      clearHoverQuickAdd();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      const td = todos.find((x) => x.id === todoId);
      if (!td) return;
      const slot = td.timeSlots.find((s) => s.id === slotId);
      if (!slot) return;
      setDrag({
        todoId,
        slotId,
        edge,
        origStart: timeToMinutes(slot.start),
        origEnd: slot.end ? timeToMinutes(slot.end) : null,
        startX: e.clientX,
      });
      setTooltip(null);
    },
    [clearHoverQuickAdd, todos],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!drag || !barRef.current) return;
      const dx = e.clientX - drag.startX;
      const dMin = (dx / barRef.current.clientWidth) * RANGE;

      if (drag.edge === "start") {
        if (drag.origEnd === null) return;
        const newStart = snap(
          Math.max(START, Math.min(drag.origEnd - SNAP, drag.origStart + dMin)),
        );
        updateTimeSlot(drag.todoId, drag.slotId, { start: minutesToTime(newStart) });
      } else if (drag.edge === "end") {
        if (drag.origEnd === null) return;
        const newEnd = snap(Math.max(drag.origStart + SNAP, Math.min(END, drag.origEnd + dMin)));
        updateTimeSlot(drag.todoId, drag.slotId, { end: minutesToTime(newEnd) });
      } else {
        const newPoint = snap(Math.max(START, Math.min(END, drag.origStart + dMin)));
        updateTimeSlot(drag.todoId, drag.slotId, { start: minutesToTime(newPoint) });
      }
    },
    [drag, RANGE, START, END, updateTimeSlot],
  );

  const onPointerUp = useCallback(() => {
    setDrag(null);
  }, []);

  const showTooltip = (e: React.MouseEvent, text: string) => {
    if (drag || mobile) return;
    const cRect = containerRef.current?.getBoundingClientRect();
    const bRect = barRef.current?.getBoundingClientRect();
    if (!cRect || !bRect) return;
    setTooltip({
      text,
      x: e.clientX - cRect.left,
      y: bRect.top - cRect.top,
    });
  };

  const buildHoverQuickAdd = useCallback(
    (clientX: number) => {
      if (!barRef.current) return null;
      const rect = barRef.current.getBoundingClientRect();
      const barWidth = rect.width;
      const ratio = (clientX - rect.left) / Math.max(barWidth, 1);
      const startMin = snap(Math.max(START, Math.min(END - SNAP, START + ratio * RANGE)));
      const endMin = Math.min(END, startMin + 60);
      const start = minutesToTime(startMin);
      const end = endMin - startMin >= SNAP ? minutesToTime(endMin) : null;
      const rawLeft = clientX - rect.left;
      return {
        left: Math.max(70, Math.min(rawLeft, barWidth - 70)),
        start,
        end,
        label: end ? `${start}-${end}` : start,
      };
    },
    [END, RANGE, START],
  );

  const scheduleHoverQuickAdd = (e: React.MouseEvent<HTMLDivElement>) => {
    if (drag || mobile) return;
    const target = e.target as HTMLElement;
    if (target.closest("[data-slot-item='true']")) {
      clearHoverQuickAdd();
      return;
    }
    if (target.closest("[data-hover-create='true']")) return;

    const candidate = buildHoverQuickAdd(e.clientX);
    if (!candidate) return;
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    setHoverQuickAdd(null);
    hoverTimerRef.current = setTimeout(() => {
      setTooltip(null);
      setHoverQuickAdd(candidate);
      hoverTimerRef.current = null;
    }, 500);
  };

  const createAtCurrentTime = () => {
    const d = new Date();
    const curMin = d.getHours() * 60 + d.getMinutes();
    const startMin = snap(Math.max(START, Math.min(END - 60, curMin)));
    const endMin = Math.min(END, startMin + 60);
    addTimelineTodo(refDate, minutesToTime(startMin), minutesToTime(endMin));
  };

  const createHoveredTask = () => {
    if (!hoverQuickAdd) return;
    addTimelineTodo(refDate, hoverQuickAdd.start, hoverQuickAdd.end);
    clearHoverQuickAdd();
  };

  const renderSlot = (td: (typeof items)[0], slot: TimeSlot) => {
    const c = color(td.tagIds);
    const s = timeToMinutes(slot.start);
    const isDragging = drag !== null && drag.todoId === td.id && drag.slotId === slot.id;
    const isDayDone = isTodoCompletedForDate(td, refDate);

    if (!slot.end) {
      return (
        <div
          key={`${td.id}-${slot.id}`}
          data-slot-item="true"
          className={cn(
            "absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rotate-45 transition-transform duration-100",
            isDayDone && "opacity-25",
            isDragging && "scale-125",
            !isDragging && "cursor-grab hover:scale-110",
          )}
          style={{ left: `${pct(s)}%`, backgroundColor: c }}
          onMouseEnter={(ev) => showTooltip(ev, `${td.title}  ${slot.start}`)}
          onMouseLeave={() => setTooltip(null)}
          onClick={(ev) => {
            ev.stopPropagation();
            if (!drag) setEditingId(td.id);
          }}
          onDoubleClick={(ev) => ev.stopPropagation()}
          onPointerDown={(ev) => onPointerDown(ev, td.id, slot.id, "point")}
        />
      );
    }

    const e = timeToMinutes(slot.end);
    const leftPct = pct(s);
    const widthPct = Math.max(0.5, ((e - s) / RANGE) * 100);

    return (
      <div
        key={`${td.id}-${slot.id}`}
        data-slot-item="true"
        className={cn(
          "absolute top-1.5 bottom-1.5 transition-opacity duration-100",
          isDayDone && "opacity-25",
          isDragging && "opacity-80",
        )}
        style={{
          left: `${leftPct}%`,
          width: `${widthPct}%`,
          backgroundColor: hexToRgba(c, 0.45),
          borderLeft: `3px solid ${c}`,
        }}
        onMouseEnter={(ev) => showTooltip(ev, `${td.title}  ${slot.start}-${slot.end}`)}
        onMouseLeave={() => setTooltip(null)}
        onClick={(ev) => {
          ev.stopPropagation();
          if (!drag) setEditingId(td.id);
        }}
        onDoubleClick={(ev) => ev.stopPropagation()}
      >
        <div
          className="absolute inset-y-0 left-0 w-2 cursor-ew-resize"
          onPointerDown={(ev) => onPointerDown(ev, td.id, slot.id, "start")}
        />
        <div
          className="absolute inset-y-0 right-0 w-2 cursor-ew-resize"
          onPointerDown={(ev) => onPointerDown(ev, td.id, slot.id, "end")}
        />
      </div>
    );
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-[14px] font-semibold text-text-2 hover:text-text-1"
      >
        <span
          className="inline-block transition-transform duration-200"
          style={{ transform: open ? "rotate(0deg)" : "rotate(-90deg)" }}
        >
          <ChevronDown size={18} />
        </span>
        {t("timeline.title", locale)}
      </button>
      <div
        className="grid transition-[grid-template-rows] duration-200 ease-out"
        style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
      >
        <div
          className="min-h-0 overflow-hidden"
          style={{ marginTop: open ? "4px" : "0px", transition: "margin-top 0.2s ease-out" }}
        >
          <div className="relative mb-1 h-5 text-[12px] text-text-3">
            {hours.map((h, i) => {
              const isFirst = i === 0;
              const isLast = i === hours.length - 1;
              const totalH = endHour - startHour;
              const step = mobile ? (totalH > 12 ? 4 : totalH > 8 ? 3 : 2) : 1;
              const showLabel = !mobile || i % step === 0 || isLast;
              if (!showLabel) return null;
              return (
                <span
                  key={h}
                  className={cn(
                    "absolute",
                    isFirst ? "translate-x-0" : isLast ? "-translate-x-full" : "-translate-x-1/2",
                  )}
                  style={{ left: `${pct(h * 60)}%` }}
                >
                  {h}
                </span>
              );
            })}
            {showNow && (
              <div
                className={cn(
                  "absolute z-10 bg-danger px-1.5 py-0.5 text-[12px] font-bold leading-none text-white shadow-sm",
                  nowLabelAlign === "center" && "-translate-x-1/2",
                  nowLabelAlign === "end" && "-translate-x-full",
                )}
                style={{ left: `${nowPct}%`, top: "-2px" }}
              >
                {nowLabel}
              </div>
            )}
          </div>

          <div
            ref={barRef}
            className="relative h-9 overflow-visible bg-surface-2"
            onMouseMove={scheduleHoverQuickAdd}
            onPointerMove={drag ? onPointerMove : undefined}
            onPointerUp={drag ? onPointerUp : undefined}
            onPointerLeave={() => {
              clearHoverQuickAdd();
              if (!drag) setTooltip(null);
            }}
          >
            {hours.map((h) => (
              <div
                key={h}
                className="absolute top-0 h-full w-px bg-border/40"
                style={{ left: `${pct(h * 60)}%` }}
              />
            ))}

            {items.map((td) => td.timeSlots.map((slot) => renderSlot(td, slot)))}

            {showNow && (
              <div
                className="absolute top-0 z-10 h-full w-0.5 bg-danger"
                style={{ left: `${nowPct}%` }}
              />
            )}

            {!mobile && hoverQuickAdd && !drag && (
              <button
                type="button"
                data-hover-create="true"
                onClick={createHoveredTask}
                className="absolute top-1/2 z-20 flex h-7 -translate-x-1/2 -translate-y-1/2 items-center gap-1 whitespace-nowrap overflow-hidden max-w-[160px] border border-accent/40 bg-surface-1/95 px-2 text-[11px] font-medium text-accent shadow-lg backdrop-blur"
                style={{ left: `${hoverQuickAdd.left}px` }}
              >
                <Plus size={11} className="shrink-0" />
                <span className="truncate">{hoverQuickAdd.label}</span>
              </button>
            )}
          </div>

          {mobile && (
            <button
              type="button"
              onClick={createAtCurrentTime}
              className="mt-2 flex items-center gap-1.5 text-[13px] font-medium text-accent"
            >
              <Plus size={14} />
              {t("timeline.new_task", locale)}
            </button>
          )}
        </div>
      </div>

      {tooltip && (
        <div
          className="pointer-events-none absolute z-50 max-w-[200px] truncate bg-surface-3 px-2.5 py-1 text-[12px] font-medium text-text-1 shadow-lg"
          style={{
            left: `${tooltip.x}px`,
            top: `${tooltip.y - 4}px`,
            transform: "translateX(-50%) translateY(-100%)",
          }}
        >
          {tooltip.text}
        </div>
      )}
    </div>
  );
}
