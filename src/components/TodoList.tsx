import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  DndContext,
  DragOverlay,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { AlertTriangle, ListChecks } from "lucide-react";
import { t } from "@/i18n";
import { isTodoCompletedForDate, isTodoVisibleOnBoard } from "@/lib/todo-helpers";
import { getOverdueDays, getTodayDateKey } from "@/lib/utils";
import { useTodoStore } from "@/stores/todoStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { SortableTodoItem, TodoItem } from "./TodoItem";
import type { PlanningBoard } from "@/types";

interface Props {
  board: PlanningBoard;
  boardDate: string;
}

export function TodoList({ board, boardDate }: Props) {
  const todos = useTodoStore((s) => s.todos);
  const viewMode = useTodoStore((s) => s.viewMode);
  const filterTagIds = useTodoStore((s) => s.filterTagIds);
  const reorderTodos = useTodoStore((s) => s.reorderTodos);
  const locale = useSettingsStore((s) => s.locale);
  const todayK = getTodayDateKey();
  const effectiveBoardDate = board === "today" ? todayK : boardDate;

  const filtered = useMemo(() => {
    let list = todos.filter((todo) => isTodoVisibleOnBoard(todo, board, boardDate, todayK));
    if (viewMode === "active")
      list = list.filter((todo) => !isTodoCompletedForDate(todo, effectiveBoardDate));
    else if (viewMode === "completed")
      list = list.filter((todo) => isTodoCompletedForDate(todo, effectiveBoardDate));
    if (filterTagIds.length > 0)
      list = list.filter((td) => filterTagIds.some((fid) => td.tagIds.includes(fid)));
    return list;
  }, [board, boardDate, effectiveBoardDate, filterTagIds, todayK, todos, viewMode]);

  const active = useMemo(
    () =>
      filtered
        .filter((todo) => !isTodoCompletedForDate(todo, effectiveBoardDate))
        .sort((a, b) => a.order - b.order),
    [effectiveBoardDate, filtered],
  );
  const completed = filtered
    .filter((todo) => isTodoCompletedForDate(todo, effectiveBoardDate))
    .sort((a, b) => a.order - b.order);
  const odN = active.filter(
    (td) => getOverdueDays(td.targetDate, todayK, td.durationDays) > 0,
  ).length;

  const [activeId, setActiveId] = useState<string | null>(null);
  const activeTodo = useMemo(
    () => (activeId ? active.find((td) => td.id === activeId) : null),
    [activeId, active],
  );

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  function onDragStart(ev: DragStartEvent) {
    setActiveId(String(ev.active.id));
  }
  function onDragEnd(ev: DragEndEvent) {
    const { active: a, over } = ev;
    setActiveId(null);
    if (over && a.id !== over.id)
      reorderTodos(
        String(a.id),
        String(over.id),
        active.map((td) => td.id),
      );
  }

  if (filtered.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-text-3">
        <ListChecks size={36} strokeWidth={1.2} className="mb-4 opacity-25" />
        <p className="text-[14px] font-medium text-text-2">{t("todo.empty", locale)}</p>
        <p className="mt-1.5 text-[13px] text-text-3">{t("todo.empty.hint", locale)}</p>
      </div>
    );
  }

  return (
    <div>
      {board === "today" && odN > 0 && viewMode !== "completed" && (
        <div className="flex items-center gap-2 border-b border-warning/20 bg-warning/[0.05] px-6 py-2 text-[13px] font-semibold text-warning">
          <AlertTriangle size={14} />
          {t("status.overdue", locale, { n: odN })}
        </div>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
      >
        <SortableContext items={active.map((td) => td.id)} strategy={verticalListSortingStrategy}>
          {active.map((td, i) => (
            <SortableTodoItem
              key={td.id}
              todo={td}
              boardDate={board === "today" ? todayK : boardDate}
              index={active.length > 1 ? i + 1 : undefined}
            />
          ))}
        </SortableContext>

        {createPortal(
          <DragOverlay dropAnimation={null}>
            {activeTodo ? (
              <div className="cursor-grabbing border-b border-border/60 bg-surface-1 shadow-xl">
                <TodoItem todo={activeTodo} boardDate={board === "today" ? todayK : boardDate} />
              </div>
            ) : null}
          </DragOverlay>,
          document.body,
        )}
      </DndContext>

      {completed.length > 0 && active.length > 0 && (
        <div className="flex items-center gap-3 px-6 py-2">
          <div className="h-px flex-1 bg-border/50" />
          <span className="text-[12px] text-text-3">
            {t("todo.completed_sep", locale, { n: completed.length })}
          </span>
          <div className="h-px flex-1 bg-border/50" />
        </div>
      )}

      {completed.map((td) => (
        <TodoItem key={td.id} todo={td} boardDate={board === "today" ? todayK : boardDate} />
      ))}
    </div>
  );
}
