import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, Check, Clock, GripVertical, Plus, Trash2, X } from "lucide-react";
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
import { t } from "@/i18n";
import { withTodoDefaults } from "@/lib/todo-helpers";
import { useSettingsStore } from "@/stores/settingsStore";
import { useTodoStore } from "@/stores/todoStore";
import { useTagStore } from "@/stores/tagStore";
import {
  cn,
  DIFFICULTY_CONFIG,
  getOverdueDays,
  getTodayDateKey,
  getTomorrowDateKey,
} from "@/lib/utils";
import { TagBadge } from "./TagBadge";
import type { Difficulty, Locale, SubTask, TaskRelationType, TimeSlot, Todo } from "@/types";

const REMINDER_PRESETS = [null, 0, 5, 15, 30, 60, 120, 720] as const;

export function TodoDetail() {
  const locale = useSettingsStore((s) => s.locale);
  const enableSubtasks = useSettingsStore((s) => s.enableSubtasks);
  const maxDurationDays = useSettingsStore((s) => s.maxDurationDays);
  const editId = useTodoStore((s) => s.editingTodoId);
  const setEditId = useTodoStore((s) => s.setEditingTodoId);
  const update = useTodoStore((s) => s.updateTodo);
  const addSubtask = useTodoStore((s) => s.addSubtask);
  const updateSubtaskTitle = useTodoStore((s) => s.updateSubtaskTitle);
  const toggleSubtask = useTodoStore((s) => s.toggleSubtask);
  const deleteSubtask = useTodoStore((s) => s.deleteSubtask);
  const reorderSubtasks = useTodoStore((s) => s.reorderSubtasks);
  const addTimeSlot = useTodoStore((s) => s.addTimeSlot);
  const removeTimeSlot = useTodoStore((s) => s.removeTimeSlot);
  const updateTimeSlot = useTodoStore((s) => s.updateTimeSlot);
  const addRelation = useTodoStore((s) => s.addRelation);
  const deleteRelation = useTodoStore((s) => s.deleteRelation);
  const todos = useTodoStore((s) => s.todos);
  const tags = useTagStore((s) => s.tags);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [subtaskInput, setSubtaskInput] = useState("");
  const [customReminderDraft, setCustomReminderDraft] = useState<{
    todoId: string | null;
    value: string;
  }>({
    todoId: null,
    value: "",
  });
  const ref = useRef<HTMLDivElement>(null);

  const todo = useMemo(() => {
    if (!editId) return null;
    const matched = todos.find((td) => td.id === editId);
    return matched ? withTodoDefaults(matched) : null;
  }, [editId, todos]);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setPickerOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  if (!todo) return null;

  const od = todo.completed
    ? 0
    : getOverdueDays(todo.targetDate, getTodayDateKey(), todo.durationDays);
  const slots = todo.timeSlots;
  const avail = tags.filter(
    (tg) => !todo.tagIds.includes(tg.id) && tg.name.toLowerCase().includes(search.toLowerCase()),
  );
  const customReminder =
    customReminderDraft.todoId === todo.id
      ? customReminderDraft.value
      : todo.reminderMinsBefore == null
        ? ""
        : String(todo.reminderMinsBefore);
  const todayKey = getTodayDateKey();
  const tomorrowKey = getTomorrowDateKey();

  const applyTargetDate = (nextDate: string) => {
    if (!nextDate || nextDate === todo.targetDate) return;
    update(todo.id, {
      targetDate: nextDate,
      ...(todo.durationDays > 1 ||
      todo.completedDayKeys.length > 0 ||
      todo.archivedDayKeys.length > 0
        ? {
            completed: false,
            completedDayKeys: [],
            archivedDayKeys: [],
          }
        : {}),
    });
  };

  const applyCustomReminder = () => {
    if (!slots.length) return;
    const parsed = Number(customReminder);
    if (!Number.isFinite(parsed)) return;
    const clamped = Math.max(0, Math.min(720, Math.round(parsed)));
    update(todo.id, { reminderMinsBefore: clamped });
    setCustomReminderDraft({ todoId: todo.id, value: String(clamped) });
  };

  const formatReminderLabel = (mins: (typeof REMINDER_PRESETS)[number]) => {
    if (mins == null) return t("detail.reminder_off", locale);
    if (mins === 0) return t("detail.reminder_at_time", locale);
    if (mins >= 60 && mins % 60 === 0) {
      return t("detail.reminder_hours", locale, { n: mins / 60 });
    }
    return t("detail.reminder_mins", locale, { n: mins });
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-surface-1">
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <h2 className="text-[16px] font-bold">{t("detail.title", locale)}</h2>
        <button
          type="button"
          onClick={() => setEditId(null)}
          className="p-1.5 text-text-3 hover:bg-surface-2 hover:text-text-1"
        >
          <X size={18} />
        </button>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto p-5">
        {od > 0 && (
          <div className="bg-warning/10 p-4 text-warning">
            <div className="flex items-center gap-2 text-[15px] font-bold">
              <AlertTriangle size={16} />
              {t("task.overdue", locale, { n: od })}
            </div>
            <p className="mt-1 text-[15px] opacity-80">{t("task.overdue_note", locale)}</p>
          </div>
        )}

        <div>
          <label className="mb-1.5 block text-[15px] font-medium text-text-2">
            {t("detail.name", locale)}
          </label>
          <input
            type="text"
            value={todo.title}
            onChange={(e) => update(todo.id, { title: e.target.value })}
            className="w-full border border-border bg-surface-2 px-4 py-2.5 text-[16px] text-text-1 outline-none focus:border-accent"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-[15px] font-medium text-text-2">
            {t("detail.difficulty", locale)}
          </label>
          <div className="grid grid-cols-4 gap-1">
            {([1, 2, 3, 4] as Difficulty[]).map((d) => {
              const c = DIFFICULTY_CONFIG[d];
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => update(todo.id, { difficulty: d })}
                  className={cn(
                    "flex items-center justify-center gap-1 border py-2 text-[15px] font-medium transition-all",
                    todo.difficulty === d
                      ? "border-accent bg-accent-soft text-accent"
                      : "border-border bg-surface-2 text-text-2 hover:bg-surface-3",
                  )}
                >
                  <span className="h-2 w-2" style={{ backgroundColor: c.color }} />
                  {t(`diff.${d}`, locale)}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-[15px] font-medium text-text-2">
            {t("detail.date", locale)}
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => applyTargetDate(todayKey)}
              className={cn(
                "border px-3 py-2 text-[14px] font-medium transition-all",
                todo.targetDate === todayKey
                  ? "border-accent bg-accent-soft text-accent"
                  : "border-border bg-surface-2 text-text-2 hover:bg-surface-3",
              )}
            >
              {t("detail.move_today", locale)}
            </button>
            <button
              type="button"
              onClick={() => applyTargetDate(tomorrowKey)}
              className={cn(
                "border px-3 py-2 text-[14px] font-medium transition-all",
                todo.targetDate === tomorrowKey
                  ? "border-accent bg-accent-soft text-accent"
                  : "border-border bg-surface-2 text-text-2 hover:bg-surface-3",
              )}
            >
              {t("detail.move_tomorrow", locale)}
            </button>
          </div>
          {(todo.durationDays > 1 ||
            todo.completedDayKeys.length > 0 ||
            todo.archivedDayKeys.length > 0) && (
            <p className="mt-2 text-[13px] text-text-3">{t("detail.date_reset_hint", locale)}</p>
          )}
        </div>

        <div>
          <label className="mb-1.5 block text-[15px] font-medium text-text-2">
            {t("detail.time_mode", locale)}
          </label>
          <div className="space-y-2">
            {slots.map((slot) => (
              <TimeSlotRow
                key={slot.id}
                slot={slot}
                todoId={todo.id}
                locale={locale}
                updateTimeSlot={updateTimeSlot}
                removeTimeSlot={removeTimeSlot}
              />
            ))}
            <button
              type="button"
              onClick={() => addTimeSlot(todo.id)}
              className="flex items-center gap-1.5 text-[14px] text-accent hover:underline"
            >
              <Clock size={14} />
              {t("detail.add_time_slot", locale)}
            </button>
          </div>
        </div>

        {slots.length > 0 && (
          <div>
            <label className="mb-1.5 block text-[15px] font-medium text-text-2">
              {t("detail.reminder", locale)}
            </label>
            <div className="grid grid-cols-4 gap-1">
              {REMINDER_PRESETS.map((mins) => (
                <button
                  key={String(mins)}
                  type="button"
                  onClick={() => {
                    setCustomReminderDraft({
                      todoId: todo.id,
                      value: mins == null ? "" : String(mins),
                    });
                    update(todo.id, { reminderMinsBefore: mins });
                  }}
                  className={cn(
                    "border py-2 text-[14px] font-medium transition-all",
                    todo.reminderMinsBefore === mins
                      ? "border-accent bg-accent-soft text-accent"
                      : "border-border bg-surface-2 text-text-2 hover:bg-surface-3",
                  )}
                >
                  {formatReminderLabel(mins)}
                </button>
              ))}
            </div>
            <div className="mt-2 flex items-center gap-2">
              <input
                type="number"
                min={0}
                max={720}
                value={customReminder}
                onChange={(e) => setCustomReminderDraft({ todoId: todo.id, value: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    applyCustomReminder();
                  }
                }}
                placeholder={t("detail.reminder_custom", locale)}
                className="w-28 border border-border bg-surface-2 px-3 py-2 text-[14px] text-text-1 outline-none"
              />
              <span className="text-[13px] text-text-3">
                {t("detail.reminder_custom_unit", locale)}
              </span>
              <button
                type="button"
                onClick={applyCustomReminder}
                className="border border-border bg-surface-2 px-3 py-2 text-[13px] font-medium text-text-2 transition-colors hover:bg-surface-3"
              >
                {t("detail.reminder_apply", locale)}
              </button>
            </div>
          </div>
        )}

        {enableSubtasks && (
          <DetailSubtaskList
            todo={todo}
            locale={locale}
            subtaskInput={subtaskInput}
            setSubtaskInput={setSubtaskInput}
            addSubtask={addSubtask}
            updateSubtaskTitle={updateSubtaskTitle}
            toggleSubtask={toggleSubtask}
            deleteSubtask={deleteSubtask}
            reorderSubtasks={reorderSubtasks}
          />
        )}

        <div>
          <label className="mb-1.5 block text-[15px] font-medium text-text-2">
            {t("duration.label", locale)}
          </label>
          <div className="flex flex-wrap gap-1">
            {Array.from({ length: maxDurationDays }, (_, i) => i + 1).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => update(todo.id, { durationDays: d })}
                className={cn(
                  "border px-3 py-2 text-[15px] font-medium transition-all",
                  todo.durationDays === d
                    ? "border-accent bg-accent-soft text-accent"
                    : "border-border bg-surface-2 text-text-2 hover:bg-surface-3",
                )}
              >
                {d}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-[15px] font-medium text-text-2">
            {t("detail.tags", locale)}
          </label>
          <div className="flex flex-wrap gap-2">
            {todo.tagIds.map((id) => {
              const tg = tags.find((x) => x.id === id);
              return tg ? (
                <TagBadge
                  key={id}
                  tag={tg}
                  removable
                  onRemove={() => update(todo.id, { tagIds: todo.tagIds.filter((x) => x !== id) })}
                />
              ) : null;
            })}
            <div className="relative" ref={ref}>
              <button
                type="button"
                onClick={() => setPickerOpen(!pickerOpen)}
                className="inline-flex h-7 w-7 items-center justify-center border border-dashed border-border text-text-3 hover:border-accent hover:text-accent"
              >
                <Plus size={14} />
              </button>
              {pickerOpen && (
                <div className="absolute left-0 top-full z-10 mt-1 w-52 border border-border bg-surface-1 p-2 shadow-lg">
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={t("tag.search", locale)}
                    className="mb-1.5 w-full border border-border bg-surface-2 px-3 py-2 text-[15px] text-text-1 outline-none placeholder:text-text-3"
                  />
                  <div className="max-h-36 overflow-y-auto">
                    {avail.length === 0 ? (
                      <p className="py-2 text-center text-[15px] text-text-3">
                        {t("tag.no_tags", locale)}
                      </p>
                    ) : (
                      avail.map((tg) => (
                        <button
                          key={tg.id}
                          type="button"
                          onClick={() => {
                            update(todo.id, { tagIds: [...todo.tagIds, tg.id] });
                            setSearch("");
                            setPickerOpen(false);
                          }}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-[15px] text-text-1 hover:bg-surface-2"
                        >
                          <span className="h-2.5 w-2.5" style={{ backgroundColor: tg.color }} />
                          {tg.name}
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <DetailRelationSection
          key={todo.id}
          todo={todo}
          todos={todos}
          locale={locale}
          addRelation={addRelation}
          deleteRelation={deleteRelation}
          openTodo={setEditId}
        />
      </div>
    </div>
  );
}

function DetailSortableSubtask({
  st,
  todoId,
  toggleSubtask,
  updateSubtaskTitle,
  onDelete,
  isDeleting,
  isEntering,
}: {
  st: SubTask;
  todoId: string;
  toggleSubtask: (todoId: string, stId: string) => void;
  updateSubtaskTitle: (todoId: string, stId: string, title: string) => void;
  onDelete: () => void;
  isDeleting?: boolean;
  isEntering?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(st.title);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: st.id,
  });

  function save() {
    const nextTitle = value.trim();
    if (nextTitle && nextTitle !== st.title) {
      updateSubtaskTitle(todoId, st.id, nextTitle);
    } else {
      setValue(st.title);
    }
    setEditing(false);
  }

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
      className={cn(
        "flex items-center gap-2",
        isDeleting && "animate-subtask-delete",
        isEntering && "animate-subtask-enter",
      )}
    >
      <div
        {...listeners}
        className="cursor-grab text-text-3 opacity-0 transition-opacity hover:opacity-60 [div:hover>&]:opacity-40"
        style={{ opacity: isDragging ? 0 : undefined }}
      >
        <GripVertical size={12} />
      </div>
      <button
        type="button"
        onClick={() => toggleSubtask(todoId, st.id)}
        className={cn(
          "flex h-4 w-4 shrink-0 items-center justify-center border",
          st.completed ? "border-success bg-success text-white" : "border-text-3/60",
        )}
      >
        {st.completed && <Check size={10} strokeWidth={2.5} />}
      </button>
      {editing ? (
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") {
              setValue(st.title);
              setEditing(false);
            }
          }}
          className="flex-1 bg-transparent text-[15px] text-text-1 outline-none"
        />
      ) : (
        <button
          type="button"
          onDoubleClick={() => {
            setValue(st.title);
            setEditing(true);
          }}
          className={cn(
            "flex-1 text-left text-[15px] text-text-1",
            st.completed && "line-through text-text-3",
          )}
        >
          {st.title}
        </button>
      )}
      <button
        type="button"
        onClick={() => {
          if (!isDeleting) onDelete();
        }}
        className="shrink-0 p-1 text-text-3 hover:text-danger"
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}

function DetailSubtaskList({
  todo,
  locale,
  subtaskInput,
  setSubtaskInput,
  addSubtask,
  updateSubtaskTitle,
  toggleSubtask,
  deleteSubtask,
  reorderSubtasks,
}: {
  todo: { id: string; subtasks: SubTask[] };
  locale: Locale;
  subtaskInput: string;
  setSubtaskInput: (v: string) => void;
  addSubtask: (todoId: string, title: string) => void;
  updateSubtaskTitle: (todoId: string, stId: string, title: string) => void;
  toggleSubtask: (todoId: string, stId: string) => void;
  deleteSubtask: (todoId: string, stId: string) => void;
  reorderSubtasks: (todoId: string, activeId: string, overId: string) => void;
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const [dragId, setDragId] = useState<string | null>(null);
  const [deletingSubId, setDeletingSubId] = useState<string | null>(null);
  const prevIdsRef = useRef<Set<string>>(new Set(todo.subtasks.map((s) => s.id)));
  const [enteringIds, setEnteringIds] = useState<Set<string>>(new Set());
  const sorted = useMemo(
    () => [...todo.subtasks].sort((a, b) => a.order - b.order),
    [todo.subtasks],
  );
  const dragSub = dragId ? sorted.find((s) => s.id === dragId) : null;

  useEffect(() => {
    const prev = prevIdsRef.current;
    const added = sorted.filter((s) => !prev.has(s.id)).map((s) => s.id);
    if (added.length > 0) {
      setEnteringIds(new Set(added));
      const timer = setTimeout(() => setEnteringIds(new Set()), 250);
      return () => clearTimeout(timer);
    }
    prevIdsRef.current = new Set(sorted.map((s) => s.id));
  }, [sorted]);

  const handleDeleteSubtask = (stId: string) => {
    if (deletingSubId) return;
    setDeletingSubId(stId);
    setTimeout(() => {
      deleteSubtask(todo.id, stId);
      setDeletingSubId(null);
    }, 280);
  };

  return (
    <div>
      <label className="mb-1.5 block text-[15px] font-medium text-text-2">
        {t("detail.subtasks", locale)}
      </label>
      <div className="space-y-2">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={(ev: DragStartEvent) => setDragId(String(ev.active.id))}
          onDragEnd={(ev: DragEndEvent) => {
            const { active, over } = ev;
            setDragId(null);
            if (over && active.id !== over.id)
              reorderSubtasks(todo.id, String(active.id), String(over.id));
          }}
        >
          <SortableContext items={sorted.map((s) => s.id)} strategy={verticalListSortingStrategy}>
            {sorted.map((st) => (
              <DetailSortableSubtask
                key={st.id}
                st={st}
                todoId={todo.id}
                toggleSubtask={toggleSubtask}
                updateSubtaskTitle={updateSubtaskTitle}
                onDelete={() => handleDeleteSubtask(st.id)}
                isDeleting={deletingSubId === st.id}
                isEntering={enteringIds.has(st.id)}
              />
            ))}
          </SortableContext>
          {createPortal(
            <DragOverlay dropAnimation={null}>
              {dragSub ? (
                <div className="flex items-center gap-2 rounded bg-surface-1 px-2 py-1 shadow-lg">
                  <GripVertical size={12} className="text-text-3" />
                  <span className="text-[15px] text-text-1">{dragSub.title}</span>
                </div>
              ) : null}
            </DragOverlay>,
            document.body,
          )}
        </DndContext>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const v = subtaskInput.trim();
            if (v) {
              addSubtask(todo.id, v);
              setSubtaskInput("");
            }
          }}
          className="flex gap-2"
        >
          <input
            type="text"
            value={subtaskInput}
            onChange={(e) => setSubtaskInput(e.target.value)}
            placeholder={t("subtask.placeholder", locale)}
            className="flex-1 border border-border bg-surface-2 px-3 py-2 text-[15px] text-text-1 outline-none placeholder:text-text-3"
          />
          <button
            type="submit"
            className="shrink-0 border border-accent bg-accent-soft px-3 py-2 text-[14px] font-medium text-accent"
          >
            {t("subtask.add", locale)}
          </button>
        </form>
      </div>
    </div>
  );
}

function DetailRelationSection({
  todo,
  todos,
  locale,
  addRelation,
  deleteRelation,
  openTodo,
}: {
  todo: Todo;
  todos: Todo[];
  locale: Locale;
  addRelation: (todoId: string, targetTaskId: string, relationType: TaskRelationType) => void;
  deleteRelation: (todoId: string, relationId: string) => void;
  openTodo: (id: string | null) => void;
}) {
  const [relationSearch, setRelationSearch] = useState("");
  const [relationType, setRelationType] = useState<TaskRelationType>("dependsOn");
  const relations = useMemo(
    () =>
      todo.outgoingRelations.map((relation) => ({
        relation,
        target: todos.find((candidate) => candidate.id === relation.targetTaskId) ?? null,
      })),
    [todo.outgoingRelations, todos],
  );

  const relationCandidates = useMemo(() => {
    const query = relationSearch.trim().toLowerCase();
    return todos
      .filter((candidate) => {
        if (candidate.id === todo.id) return false;
        if (
          todo.outgoingRelations.some(
            (relation) =>
              relation.targetTaskId === candidate.id && relation.relationType === relationType,
          )
        ) {
          return false;
        }
        return query.length === 0 || candidate.title.toLowerCase().includes(query);
      })
      .sort((a, b) => a.order - b.order)
      .slice(0, 6);
  }, [relationSearch, relationType, todo.id, todo.outgoingRelations, todos]);

  return (
    <div>
      <label className="mb-1.5 block text-[15px] font-medium text-text-2">
        {t("detail.relations", locale)}
      </label>

      <div className="space-y-2">
        {relations.length === 0 ? (
          <p className="text-[14px] text-text-3">{t("relation.none", locale)}</p>
        ) : (
          relations.map(({ relation, target }) => (
            <div
              key={relation.id}
              className="flex items-center gap-2 border border-border bg-surface-2 px-3 py-2"
            >
              <span className="shrink-0 bg-accent/10 px-2 py-1 text-[12px] font-medium text-accent">
                {t(`relation.${relation.relationType}`, locale)}
              </span>
              <button
                type="button"
                onClick={() => target && openTodo(target.id)}
                className="min-w-0 flex-1 text-left text-[14px] text-text-1 hover:text-accent"
              >
                <span className="truncate">{target?.title ?? relation.targetTaskId}</span>
              </button>
              <button
                type="button"
                onClick={() => deleteRelation(todo.id, relation.id)}
                className="shrink-0 p-1 text-text-3 hover:text-danger"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))
        )}

        <div className="grid grid-cols-[140px_minmax(0,1fr)] gap-2">
          <select
            value={relationType}
            onChange={(e) => setRelationType(e.target.value as TaskRelationType)}
            className="border border-border bg-surface-2 px-3 py-2 text-[14px] text-text-1 outline-none"
          >
            {(["dependsOn", "blocks", "relatedTo"] as TaskRelationType[]).map((type) => (
              <option key={type} value={type}>
                {t(`relation.${type}`, locale)}
              </option>
            ))}
          </select>
          <input
            type="text"
            value={relationSearch}
            onChange={(e) => setRelationSearch(e.target.value)}
            placeholder={t("relation.search", locale)}
            className="border border-border bg-surface-2 px-3 py-2 text-[14px] text-text-1 outline-none placeholder:text-text-3"
          />
        </div>

        <div className="max-h-40 overflow-y-auto border border-border bg-surface-2">
          {relationCandidates.length === 0 ? (
            <p className="px-3 py-2 text-[14px] text-text-3">{t("relation.no_targets", locale)}</p>
          ) : (
            relationCandidates.map((candidate) => (
              <button
                key={candidate.id}
                type="button"
                onClick={() => {
                  addRelation(todo.id, candidate.id, relationType);
                  setRelationSearch("");
                }}
                className="flex w-full items-center gap-2 border-b border-border/60 px-3 py-2 text-left text-[14px] text-text-1 transition-colors last:border-b-0 hover:bg-surface-3"
              >
                <Plus size={14} className="shrink-0 text-accent" />
                <span className="truncate">{candidate.title}</span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function TimeSlotRow({
  slot,
  todoId,
  locale,
  updateTimeSlot,
  removeTimeSlot,
}: {
  slot: TimeSlot;
  todoId: string;
  locale: Locale;
  updateTimeSlot: (todoId: string, slotId: string, u: Partial<Omit<TimeSlot, "id">>) => void;
  removeTimeSlot: (todoId: string, slotId: string) => void;
}) {
  const isRange = slot.end !== null;

  const toggleMode = useCallback(() => {
    if (isRange) {
      updateTimeSlot(todoId, slot.id, { end: null });
    } else {
      const [h, m] = slot.start.split(":").map(Number);
      const endMin = Math.min(h * 60 + m + 60, 1439);
      const eh = Math.floor(endMin / 60);
      const em = endMin % 60;
      updateTimeSlot(todoId, slot.id, {
        end: `${String(eh).padStart(2, "0")}:${String(em).padStart(2, "0")}`,
      });
    }
  }, [isRange, slot.id, slot.start, todoId, updateTimeSlot]);

  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={toggleMode}
        className={cn(
          "shrink-0 border px-2 py-1.5 text-[12px] font-medium transition-all",
          isRange
            ? "border-accent bg-accent-soft text-accent"
            : "border-border bg-surface-2 text-text-2 hover:bg-surface-3",
        )}
        title={isRange ? t("detail.time_range", locale) : t("detail.time_point", locale)}
      >
        {isRange ? t("detail.time_range", locale) : t("detail.time_point", locale)}
      </button>
      <input
        type="time"
        value={slot.start}
        onChange={(e) => updateTimeSlot(todoId, slot.id, { start: e.target.value || "09:00" })}
        className="w-[110px] border border-border bg-surface-2 px-2 py-1.5 text-[14px] text-text-1 outline-none"
      />
      {isRange && (
        <>
          <span className="text-[13px] text-text-3">—</span>
          <input
            type="time"
            value={slot.end ?? ""}
            onChange={(e) => updateTimeSlot(todoId, slot.id, { end: e.target.value || null })}
            className="w-[110px] border border-border bg-surface-2 px-2 py-1.5 text-[14px] text-text-1 outline-none"
          />
        </>
      )}
      <button
        type="button"
        onClick={() => removeTimeSlot(todoId, slot.id)}
        className="shrink-0 p-1 text-text-3 hover:text-danger"
      >
        <X size={14} />
      </button>
    </div>
  );
}
