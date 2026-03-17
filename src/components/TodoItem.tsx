import { useState, useRef, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, Check, ChevronRight, GripVertical, ListPlus, Trash2 } from "lucide-react";
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
import { SortableContext, verticalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  cn,
  DIFFICULTY_CONFIG,
  formatTimeSlots,
  getDayIndexInDuration,
  getOverdueDays,
  getTodayDateKey,
  hexToRgba,
} from "@/lib/utils";
import { isTodoCompletedForDate } from "@/lib/todo-helpers";
import { t } from "@/i18n";
import { useTodoStore } from "@/stores/todoStore";
import { useTagStore } from "@/stores/tagStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { TagBadge } from "@/components/TagBadge";
import type { Todo, SubTask, Locale } from "@/types";

interface Props {
  todo: Todo;
  dragListeners?: Record<string, unknown>;
  boardDate?: string;
  index?: number;
}

type RelationDisplayItem = Todo["outgoingRelations"][number] & {
  targetTitle: string;
};

const ENTER_THRESHOLD_MS = 600;

export function TodoItem({ todo, dragListeners, boardDate, index }: Props) {
  const [editing, setEditing] = useState(false);
  const [editVal, setEditVal] = useState(todo.title);
  const [anim, setAnim] = useState<"completing" | "uncompleting" | null>(null);
  const [deleting, setDeleting] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const locale = useSettingsStore((s) => s.locale);
  const enableSubtasks = useSettingsStore((s) => s.enableSubtasks);
  const toggle = useTodoStore((s) => s.toggleTodo);
  const update = useTodoStore((s) => s.updateTodo);
  const remove = useTodoStore((s) => s.deleteTodo);
  const setEdit = useTodoStore((s) => s.setEditingTodoId);
  const todos = useTodoStore((s) => s.todos);
  const addSubtask = useTodoStore((s) => s.addSubtask);
  const toggleSubtask = useTodoStore((s) => s.toggleSubtask);
  const deleteSubtask = useTodoStore((s) => s.deleteSubtask);
  const reorderSubtasks = useTodoStore((s) => s.reorderSubtasks);
  const tags = useTagStore((s) => s.tags);
  const todayK = getTodayDateKey();
  const [expanded, setExpanded] = useState(false);
  const [subtaskInput, setSubtaskInput] = useState("");
  const [dragSubId, setDragSubId] = useState<string | null>(null);
  const refDate = boardDate ?? todayK;
  const [isNew] = useState(() => Date.now() - todo.createdAt < ENTER_THRESHOLD_MS);

  const subtasks = useMemo(
    () => [...todo.subtasks].sort((a, b) => a.order - b.order),
    [todo.subtasks],
  );
  const showSubtasks = enableSubtasks;
  const doneCount = subtasks.filter((st) => st.completed).length;
  const dur = todo.durationDays;
  const dayIdx = dur > 1 ? getDayIndexInDuration(todo.targetDate, refDate, dur) : null;

  const todoTags = tags.filter((tg) => todo.tagIds.includes(tg.id));
  const relationItems = useMemo<RelationDisplayItem[]>(
    () =>
      todo.outgoingRelations.map((relation) => ({
        ...relation,
        targetTitle:
          todos.find((candidate) => candidate.id === relation.targetTaskId)?.title ??
          relation.targetTaskId,
      })),
    [todo.outgoingRelations, todos],
  );
  const primaryRelation: RelationDisplayItem | null =
    relationItems.length > 0 ? relationItems[0] : null;
  const diff = DIFFICULTY_CONFIG[todo.difficulty];
  const od = todo.completed ? 0 : getOverdueDays(todo.targetDate, todayK, todo.durationDays);
  const time = formatTimeSlots(todo.timeSlots);
  const hasMeta =
    time || todoTags.length > 0 || od > 0 || dayIdx !== null || relationItems.length > 0;

  useEffect(() => {
    if (editing) {
      ref.current?.focus();
      ref.current?.select();
    }
  }, [editing]);
  const deleteTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current);
    },
    [],
  );

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (deleting) return;
    setDeleting(true);
    deleteTimerRef.current = setTimeout(() => remove(todo.id), 350);
  };

  const isDayDone = isTodoCompletedForDate(todo, refDate);

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (anim) return;
    const currentDone = isTodoCompletedForDate(todo, refDate);
    const dir = currentDone ? "uncompleting" : "completing";
    setAnim(dir);
    timerRef.current = setTimeout(
      () => {
        toggle(todo.id, dur > 1 ? refDate : undefined);
        setAnim(null);
      },
      dir === "completing" ? 420 : 320,
    );
  };

  function save() {
    const v = editVal.trim();
    if (v && v !== todo.title) update(todo.id, { title: v });
    else setEditVal(todo.title);
    setEditing(false);
  }

  function rowClick(e: React.MouseEvent) {
    if ((e.target as HTMLElement).closest("button, input")) return;
    if (showSubtasks && (e.target as HTMLElement).closest("[data-subtask-badge]")) {
      setExpanded((x) => !x);
      return;
    }
    setEdit(todo.id);
  }

  function handleAddSubtask(e: React.SyntheticEvent) {
    e.preventDefault();
    const v = subtaskInput.trim();
    if (v) {
      addSubtask(todo.id, v);
      setSubtaskInput("");
    }
  }

  const isChecked = anim === "completing" || (isDayDone && anim !== "uncompleting");

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={rowClick}
      onKeyDown={(e) => {
        if (e.key === "Enter") rowClick(e as unknown as React.MouseEvent);
      }}
      className={cn(
        "group relative grid grid-cols-[18px_minmax(0,1fr)_18px] items-start gap-x-3 border-b border-border/60 py-2.5 pl-10 pr-5",
        od > 0 ? "bg-warning/[0.04]" : "hover:bg-surface-2/40",
        isDayDone && !anim && "opacity-50",
        anim === "completing" && "animate-row-complete",
        anim === "uncompleting" && "animate-row-uncomplete",
        deleting && "animate-row-delete",
        isNew && !anim && !deleting && "animate-row-enter",
      )}
    >
      {od > 0 && <span className="absolute inset-y-2 left-0 w-[3px] bg-warning" />}

      <div
        {...(dragListeners ?? {})}
        onClick={(e) => e.stopPropagation()}
        className="absolute left-1.5 top-1/2 -translate-y-1/2 cursor-grab text-text-3 opacity-0 transition-opacity group-hover:opacity-40"
      >
        <GripVertical size={14} />
      </div>

      {index !== undefined && !todo.completed && (
        <span
          className="absolute left-5 top-1/2 -translate-y-1/2 text-[13px] font-medium tabular-nums transition-opacity group-hover:opacity-0"
          style={{
            color:
              index <= 2
                ? "var(--color-accent)"
                : index <= 4
                  ? "var(--color-text-2)"
                  : "var(--color-text-3)",
            opacity: index <= 2 ? 0.7 : index <= 4 ? 0.45 : 0.3,
          }}
        >
          {index}
        </span>
      )}

      <button
        type="button"
        onClick={handleToggle}
        className={cn(
          "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center self-center border-2",
          isChecked
            ? "border-success bg-success text-white"
            : "border-text-3/60 hover:border-accent",
          anim === "completing" && "animate-check-pop",
        )}
      >
        {isChecked && <Check size={10} strokeWidth={3} />}
      </button>

      <div className="min-w-0 flex-1">
        {editing ? (
          <input
            ref={ref}
            value={editVal}
            onChange={(e) => setEditVal(e.target.value)}
            onBlur={save}
            onKeyDown={(e) => {
              if (e.key === "Enter") save();
              if (e.key === "Escape") {
                setEditVal(todo.title);
                setEditing(false);
              }
            }}
            onClick={(e) => e.stopPropagation()}
            className="w-full bg-transparent text-[15px] leading-snug text-text-1 outline-none"
          />
        ) : (
          <div className="flex items-baseline gap-1.5">
            <p
              className={cn(
                "text-[15px] leading-snug text-text-1",
                (isChecked || todo.completed) && "line-through text-text-3",
              )}
              onDoubleClick={(e) => {
                e.stopPropagation();
                setEditing(true);
              }}
            >
              {todo.title}
            </p>
            {showSubtasks && (
              <button
                type="button"
                data-subtask-badge
                onClick={(e) => {
                  e.stopPropagation();
                  setExpanded((x) => !x);
                }}
                className={cn(
                  "flex shrink-0 items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[11px] transition-colors",
                  "text-text-3 hover:bg-surface-3 hover:text-text-2",
                )}
                title={expanded ? "" : t("subtask.add", locale)}
              >
                <ChevronRight
                  size={12}
                  className={cn("transition-transform duration-150", expanded && "rotate-90")}
                />
                {subtasks.length > 0 && (
                  <span className="tabular-nums">
                    {t("subtask.count", locale, { done: doneCount, total: subtasks.length })}
                  </span>
                )}
              </button>
            )}
          </div>
        )}

        {primaryRelation && (
          <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[13px] leading-5 text-text-3">
            <span className="shrink-0 text-[12px] leading-none opacity-55">↳</span>
            <span className="shrink-0 font-medium">
              {t(`relation.short.${primaryRelation.relationType}`, locale)}
            </span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setEdit(primaryRelation.targetTaskId);
              }}
              title={`${t(`relation.${primaryRelation.relationType}`, locale)} ${primaryRelation.targetTitle}`}
              className="min-w-0 max-w-[220px] truncate text-left leading-5 transition-colors hover:text-accent"
            >
              {primaryRelation.targetTitle}
            </button>
            {relationItems.length > 1 && (
              <span className="shrink-0 opacity-70">+{relationItems.length - 1}</span>
            )}
          </div>
        )}

        {showSubtasks && (
          <SubtaskList
            expanded={expanded}
            subtasks={subtasks}
            locale={locale}
            subtaskInput={subtaskInput}
            setSubtaskInput={setSubtaskInput}
            onAddSubtask={handleAddSubtask}
            onToggleSubtask={(stId) => toggleSubtask(todo.id, stId)}
            onDeleteSubtask={(stId) => deleteSubtask(todo.id, stId)}
            onReorder={(aId, oId) => reorderSubtasks(todo.id, aId, oId)}
            dragSubId={dragSubId}
            setDragSubId={setDragSubId}
          />
        )}

        {hasMeta && (
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <span
              className="inline-flex items-center gap-1 px-2 py-0.5 text-[13px] font-medium"
              style={{ backgroundColor: hexToRgba(diff.color, 0.08), color: diff.color }}
            >
              <span className="h-1.5 w-1.5" style={{ backgroundColor: diff.color }} />
              {t(`diff.${todo.difficulty}`, locale)}
            </span>

            {od > 0 && (
              <span className="inline-flex items-center gap-1 bg-warning/10 px-2 py-0.5 text-[13px] font-bold text-warning">
                <AlertTriangle size={12} />
                {t("task.overdue", locale, { n: od })}
              </span>
            )}

            {dayIdx !== null && (
              <span className="inline-flex items-center gap-1 bg-accent/10 px-2 py-0.5 text-[13px] font-medium text-accent">
                {t("duration.day_n", locale, { x: dayIdx, n: dur })}
                {todo.completedDayKeys.length > 0 && (
                  <span className="opacity-70">
                    ({t("duration.done_n", locale, { n: todo.completedDayKeys.length })})
                  </span>
                )}
              </span>
            )}

            {time && (
              <span className="inline-flex items-center gap-1 text-[13px] text-text-2">
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
                {time}
              </span>
            )}

            {todoTags.map((tg) => (
              <TagBadge key={tg.id} tag={tg} />
            ))}
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={handleDelete}
        className="mt-0.5 shrink-0 rounded-md p-1.5 text-text-3 opacity-0 transition-all hover:text-danger group-hover:opacity-100"
      >
        <Trash2 size={15} />
      </button>
    </div>
  );
}

function SubtaskRow({
  st,
  onToggle,
  onDelete,
  dragListeners,
  isDeleting,
  isEntering,
}: {
  st: SubTask;
  onToggle: () => void;
  onDelete: () => void;
  dragListeners?: Record<string, unknown>;
  isDeleting?: boolean;
  isEntering?: boolean;
}) {
  return (
    <div
      className={cn(
        "group/st flex min-h-[28px] items-center gap-1.5 rounded-md py-1 pr-1 transition-colors hover:bg-surface-2/60",
        isDeleting && "animate-subtask-delete",
        isEntering && "animate-subtask-enter",
      )}
    >
      <div
        {...(dragListeners ?? {})}
        onClick={(e) => e.stopPropagation()}
        className="cursor-grab text-text-3 opacity-0 transition-opacity group-hover/st:opacity-40"
      >
        <GripVertical size={12} />
      </div>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        className={cn(
          "flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
          st.completed
            ? "border-success bg-success text-white"
            : "border-text-3/50 hover:border-accent",
        )}
      >
        {st.completed && <Check size={10} strokeWidth={2.5} />}
      </button>
      <span
        className={cn(
          "min-w-0 flex-1 text-[14px] text-text-2",
          st.completed && "line-through text-text-3",
        )}
      >
        {st.title}
      </span>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          if (!isDeleting) onDelete();
        }}
        className="shrink-0 rounded p-1 text-text-3 opacity-0 transition-opacity hover:bg-danger/10 hover:text-danger group-hover/st:opacity-100"
      >
        <Trash2 size={12} />
      </button>
    </div>
  );
}

function SortableSubtaskRow({
  st,
  onToggle,
  onDelete,
  isDeleting,
  isEntering,
}: {
  st: SubTask;
  onToggle: () => void;
  onDelete: () => void;
  isDeleting?: boolean;
  isEntering?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: st.id,
  });
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Translate.toString(transform),
        transition,
        opacity: isDragging ? 0 : undefined,
        position: "relative",
      }}
      {...attributes}
    >
      <SubtaskRow
        st={st}
        onToggle={onToggle}
        onDelete={onDelete}
        dragListeners={listeners}
        isDeleting={isDeleting}
        isEntering={isEntering}
      />
    </div>
  );
}

function SubtaskList({
  expanded,
  subtasks,
  locale,
  subtaskInput,
  setSubtaskInput,
  onAddSubtask,
  onToggleSubtask,
  onDeleteSubtask,
  onReorder,
  dragSubId,
  setDragSubId,
}: {
  expanded: boolean;
  subtasks: SubTask[];
  locale: Locale;
  subtaskInput: string;
  setSubtaskInput: (v: string) => void;
  onAddSubtask: (e: React.SyntheticEvent) => void;
  onToggleSubtask: (id: string) => void;
  onDeleteSubtask: (id: string) => void;
  onReorder: (activeId: string, overId: string) => void;
  dragSubId: string | null;
  setDragSubId: (id: string | null) => void;
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const dragSub = dragSubId ? subtasks.find((s) => s.id === dragSubId) : null;
  const [deletingSubId, setDeletingSubId] = useState<string | null>(null);
  const prevIdsRef = useRef<Set<string>>(new Set(subtasks.map((s) => s.id)));
  const [enteringIds, setEnteringIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const prev = prevIdsRef.current;
    const added = subtasks.filter((s) => !prev.has(s.id)).map((s) => s.id);
    if (added.length > 0) {
      setEnteringIds(new Set(added));
      const timer = setTimeout(() => setEnteringIds(new Set()), 250);
      return () => clearTimeout(timer);
    }
    prevIdsRef.current = new Set(subtasks.map((s) => s.id));
  }, [subtasks]);

  const handleDeleteSubtask = (id: string) => {
    if (deletingSubId) return;
    setDeletingSubId(id);
    setTimeout(() => {
      onDeleteSubtask(id);
      setDeletingSubId(null);
    }, 280);
  };

  function onDragStart(ev: DragStartEvent) {
    setDragSubId(String(ev.active.id));
  }
  function onDragEnd(ev: DragEndEvent) {
    const { active, over } = ev;
    setDragSubId(null);
    if (over && active.id !== over.id) {
      onReorder(String(active.id), String(over.id));
    }
  }

  return (
    <div className={cn("grid subtask-expand", expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
      <div className="min-h-0 overflow-hidden">
        <div className="mt-3 ml-1 space-y-0.5">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
          >
            <SortableContext
              items={subtasks.map((st) => st.id)}
              strategy={verticalListSortingStrategy}
            >
              {subtasks.map((st) => (
                <SortableSubtaskRow
                  key={st.id}
                  st={st}
                  onToggle={() => onToggleSubtask(st.id)}
                  onDelete={() => handleDeleteSubtask(st.id)}
                  isDeleting={deletingSubId === st.id}
                  isEntering={enteringIds.has(st.id)}
                />
              ))}
            </SortableContext>
            {createPortal(
              <DragOverlay dropAnimation={null}>
                {dragSub ? (
                  <div className="cursor-grabbing rounded-md bg-surface-1 shadow-lg">
                    <SubtaskRow st={dragSub} onToggle={() => {}} onDelete={() => {}} />
                  </div>
                ) : null}
              </DragOverlay>,
              document.body,
            )}
          </DndContext>
          <form
            onSubmit={onAddSubtask}
            className="flex items-center gap-2 rounded-md border border-dashed border-border/60 bg-surface-2/40 py-1.5 pl-2 pr-2 transition-colors hover:border-accent/40 hover:bg-surface-2/60"
          >
            <ListPlus size={14} className="shrink-0 text-text-3" />
            <input
              type="text"
              value={subtaskInput}
              onChange={(e) => setSubtaskInput(e.target.value)}
              placeholder={t("subtask.placeholder", locale)}
              onClick={(e) => e.stopPropagation()}
              className="min-w-0 flex-1 bg-transparent text-[13px] text-text-2 outline-none placeholder:text-text-3"
            />
            <button
              type="submit"
              className="shrink-0 rounded px-2 py-0.5 text-[12px] font-medium text-accent hover:bg-accent-soft"
            >
              {t("subtask.add", locale)}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export function SortableTodoItem({
  todo,
  boardDate,
  index,
}: {
  todo: Todo;
  boardDate: string;
  index?: number;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: todo.id,
  });
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Translate.toString(transform),
        transition,
        opacity: isDragging ? 0 : undefined,
        position: "relative",
      }}
      {...attributes}
    >
      <TodoItem todo={todo} dragListeners={listeners} boardDate={boardDate} index={index} />
    </div>
  );
}
