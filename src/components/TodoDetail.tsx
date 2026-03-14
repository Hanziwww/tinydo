import { useState, useRef, useEffect, useMemo } from "react";
import { AlertTriangle, Check, GripVertical, Plus, Trash2, X } from "lucide-react";
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
import { useSettingsStore } from "@/stores/settingsStore";
import { useTodoStore } from "@/stores/todoStore";
import { useTagStore } from "@/stores/tagStore";
import { cn, DIFFICULTY_CONFIG, getOverdueDays, getTodayDateKey } from "@/lib/utils";
import { TagBadge } from "./TagBadge";
import type { Difficulty, Locale, SubTask } from "@/types";

export function TodoDetail() {
  const locale = useSettingsStore((s) => s.locale);
  const enableSubtasks = useSettingsStore((s) => s.enableSubtasks);
  const maxDurationDays = useSettingsStore((s) => s.maxDurationDays);
  const editId = useTodoStore((s) => s.editingTodoId);
  const setEditId = useTodoStore((s) => s.setEditingTodoId);
  const update = useTodoStore((s) => s.updateTodo);
  const addSubtask = useTodoStore((s) => s.addSubtask);
  const toggleSubtask = useTodoStore((s) => s.toggleSubtask);
  const deleteSubtask = useTodoStore((s) => s.deleteSubtask);
  const reorderSubtasks = useTodoStore((s) => s.reorderSubtasks);
  const todos = useTodoStore((s) => s.todos);
  const tags = useTagStore((s) => s.tags);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [subtaskInput, setSubtaskInput] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  const todo = todos.find((td) => td.id === editId);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setPickerOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  if (!todo) return null;

  const od = todo.completed ? 0 : getOverdueDays(todo.targetDate, getTodayDateKey());
  const mode: "none" | "point" | "range" =
    todo.timeStart && todo.timeEnd ? "range" : todo.timeStart ? "point" : "none";
  const avail = tags.filter(
    (tg) => !todo.tagIds.includes(tg.id) && tg.name.toLowerCase().includes(search.toLowerCase()),
  );

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
            {t("detail.time_mode", locale)}
          </label>
          <div className="grid grid-cols-3 gap-1">
            {(["none", "point", "range"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  if (m === "none") update(todo.id, { timeStart: null, timeEnd: null });
                  else if (m === "point")
                    update(todo.id, { timeStart: todo.timeStart ?? "09:00", timeEnd: null });
                  else
                    update(todo.id, {
                      timeStart: todo.timeStart ?? "09:00",
                      timeEnd: todo.timeEnd ?? "10:00",
                    });
                }}
                className={cn(
                  "border py-2 text-[15px] font-medium transition-all",
                  mode === m
                    ? "border-accent bg-accent-soft text-accent"
                    : "border-border bg-surface-2 text-text-2 hover:bg-surface-3",
                )}
              >
                {t(`detail.time_${m}`, locale)}
              </button>
            ))}
          </div>
          {mode === "point" && (
            <input
              type="time"
              value={todo.timeStart ?? ""}
              onChange={(e) =>
                update(todo.id, { timeStart: e.target.value || null, timeEnd: null })
              }
              className="mt-2 w-full border border-border bg-surface-2 px-4 py-2 text-[15px] text-text-1 outline-none"
            />
          )}
          {mode === "range" && (
            <div className="mt-2 grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-[15px] text-text-3">
                  {t("detail.start", locale)}
                </label>
                <input
                  type="time"
                  value={todo.timeStart ?? ""}
                  onChange={(e) => update(todo.id, { timeStart: e.target.value || null })}
                  className="w-full border border-border bg-surface-2 px-4 py-2.5 text-[16px] text-text-1 outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-[15px] text-text-3">
                  {t("detail.end", locale)}
                </label>
                <input
                  type="time"
                  value={todo.timeEnd ?? ""}
                  onChange={(e) => update(todo.id, { timeEnd: e.target.value || null })}
                  className="w-full border border-border bg-surface-2 px-4 py-2.5 text-[16px] text-text-1 outline-none"
                />
              </div>
            </div>
          )}
        </div>

        {mode !== "none" && (
          <div>
            <label className="mb-1.5 block text-[15px] font-medium text-text-2">
              {t("detail.reminder", locale)}
            </label>
            <div className="grid grid-cols-4 gap-1">
              {([null, 5, 10, 15] as const).map((mins) => (
                <button
                  key={String(mins)}
                  type="button"
                  onClick={() => update(todo.id, { reminderMinsBefore: mins })}
                  className={cn(
                    "border py-2 text-[14px] font-medium transition-all",
                    todo.reminderMinsBefore === mins
                      ? "border-accent bg-accent-soft text-accent"
                      : "border-border bg-surface-2 text-text-2 hover:bg-surface-3",
                  )}
                >
                  {mins == null
                    ? t("detail.reminder_off", locale)
                    : t("detail.reminder_mins", locale, { n: mins })}
                </button>
              ))}
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
                  (todo.durationDays ?? 1) === d
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
      </div>
    </div>
  );
}

function DetailSortableSubtask({
  st,
  todoId,
  toggleSubtask,
  deleteSubtask,
}: {
  st: SubTask;
  todoId: string;
  toggleSubtask: (todoId: string, stId: string) => void;
  deleteSubtask: (todoId: string, stId: string) => void;
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
      className="flex items-center gap-2"
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
      <span
        className={cn(
          "flex-1 text-[15px] text-text-1",
          st.completed && "line-through text-text-3",
        )}
      >
        {st.title}
      </span>
      <button
        type="button"
        onClick={() => deleteSubtask(todoId, st.id)}
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
  toggleSubtask,
  deleteSubtask,
  reorderSubtasks,
}: {
  todo: { id: string; subtasks: SubTask[] };
  locale: Locale;
  subtaskInput: string;
  setSubtaskInput: (v: string) => void;
  addSubtask: (todoId: string, title: string) => void;
  toggleSubtask: (todoId: string, stId: string) => void;
  deleteSubtask: (todoId: string, stId: string) => void;
  reorderSubtasks: (todoId: string, activeId: string, overId: string) => void;
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const [dragId, setDragId] = useState<string | null>(null);
  const sorted = useMemo(
    () => [...(todo.subtasks ?? [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [todo.subtasks],
  );
  const dragSub = dragId ? sorted.find((s) => s.id === dragId) : null;

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
                deleteSubtask={deleteSubtask}
              />
            ))}
          </SortableContext>
          <DragOverlay dropAnimation={null}>
            {dragSub ? (
              <div className="flex items-center gap-2 rounded bg-surface-1 px-2 py-1 shadow-lg">
                <GripVertical size={12} className="text-text-3" />
                <span className="text-[15px] text-text-1">{dragSub.title}</span>
              </div>
            ) : null}
          </DragOverlay>
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
