import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { t } from "@/i18n";
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

interface Props {
  board: PlanningBoard;
  boardDate: string;
}

const SNAP = 5;
const snap = (m: number) => Math.round(m / SNAP) * SNAP;

export function Timeline({ board, boardDate }: Props) {
  const locale = useSettingsStore((s) => s.locale);
  const startHour = useSettingsStore((s) => s.timelineStartHour);
  const endHour = useSettingsStore((s) => s.timelineEndHour);
  const [open, setOpen] = useState(true);
  const [nowMin, setNowMin] = useState(() => {
    const d = new Date();
    return d.getHours() * 60 + d.getMinutes();
  });
  const todos = useTodoStore((s) => s.todos);
  const updateTimeSlot = useTodoStore((s) => s.updateTimeSlot);
  const setEditingId = useTodoStore((s) => s.setEditingTodoId);
  const tags = useTagStore((s) => s.tags);
  const todayK = getTodayDateKey();
  const barRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [tooltip, setTooltip] = useState<{ text: string; x: number; y: number } | null>(null);
  const [drag, setDrag] = useState<{
    todoId: string;
    slotId: string;
    edge: "start" | "end" | "point";
    origStart: number;
    origEnd: number | null;
    startX: number;
  } | null>(null);

  useEffect(() => {
    const id = setInterval(() => {
      const d = new Date();
      setNowMin(d.getHours() * 60 + d.getMinutes());
    }, 30_000);
    return () => clearInterval(id);
  }, []);

  const START = startHour * 60;
  const END = endHour * 60;
  const RANGE = END - START;

  const refDate = board === "today" ? todayK : boardDate;
  const items = todos.filter((td) => {
    const dur = td.durationDays;
    const endDate = shiftDateKey(td.targetDate, dur - 1);
    const inB = td.targetDate <= refDate && endDate >= refDate;
    return inB && td.timeSlots.length > 0;
  });

  const color = (ids: string[]) => tags.find((tg) => ids.includes(tg.id))?.color ?? "#6366f1";
  const pct = (m: number) => ((Math.max(START, Math.min(END, m)) - START) / RANGE) * 100;
  const hours: number[] = [];
  for (let h = startHour; h <= endHour; h++) hours.push(h);

  const nowPct = pct(nowMin);
  const showNow = board === "today" && nowMin >= START && nowMin <= END;
  const nowLabel = `${String(Math.floor(nowMin / 60)).padStart(2, "0")}:${String(nowMin % 60).padStart(2, "0")}`;

  const onPointerDown = useCallback(
    (e: React.PointerEvent, todoId: string, slotId: string, edge: "start" | "end" | "point") => {
      e.stopPropagation();
      e.preventDefault();
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
    [todos],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!drag || !barRef.current) return;
      const dx = e.clientX - drag.startX;
      const dMin = (dx / barRef.current.clientWidth) * RANGE;

      if (drag.edge === "start") {
        const newStart = snap(
          Math.max(START, Math.min(drag.origEnd! - SNAP, drag.origStart + dMin)),
        );
        updateTimeSlot(drag.todoId, drag.slotId, { start: minutesToTime(newStart) });
      } else if (drag.edge === "end") {
        const newEnd = snap(Math.max(drag.origStart + SNAP, Math.min(END, drag.origEnd! + dMin)));
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
    if (drag) return;
    const cRect = containerRef.current?.getBoundingClientRect();
    const bRect = barRef.current?.getBoundingClientRect();
    if (!cRect || !bRect) return;
    setTooltip({
      text,
      x: e.clientX - cRect.left,
      y: bRect.top - cRect.top,
    });
  };

  const renderSlot = (td: (typeof items)[0], slot: TimeSlot) => {
    const c = color(td.tagIds);
    const s = timeToMinutes(slot.start);
    const isDragging = drag !== null && drag.todoId === td.id && drag.slotId === slot.id;
    const isDayDone = td.durationDays > 1 ? td.completedDayKeys.includes(refDate) : td.completed;

    if (!slot.end) {
      return (
        <div
          key={`${td.id}-${slot.id}`}
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
                className="absolute -translate-x-1/2 bg-danger px-1.5 py-0.5 text-[12px] font-bold leading-none text-white"
                style={{ left: `${nowPct}%`, top: "-2px" }}
              >
                {nowLabel}
              </div>
            )}
          </div>

          <div
            ref={barRef}
            className="relative h-9 overflow-visible bg-surface-2"
            onPointerMove={drag ? onPointerMove : undefined}
            onPointerUp={drag ? onPointerUp : undefined}
            onPointerLeave={() => {
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
                className="absolute top-0 h-full w-0.5 bg-danger"
                style={{ left: `${nowPct}%` }}
              />
            )}
          </div>
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
