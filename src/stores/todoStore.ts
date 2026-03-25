import { create } from "zustand";
import { nanoid } from "nanoid";
import { withTodoDefaults, stripRelationsToTarget } from "@/lib/todo-helpers";
import { t } from "@/i18n";
import type {
  Todo,
  ViewMode,
  Difficulty,
  TimeSlot,
  TaskRelationType,
  TodoHistoryKind,
} from "@/types";
import { getTodayDateKey, getTomorrowDateKey, shiftDateKey } from "@/lib/utils";
import * as backend from "@/lib/backend";
import { showErrorNotice, showSuccessNotice, showUndoNotice } from "@/lib/errorNotice";
import { useSettingsStore } from "@/stores/settingsStore";
import { recordEvent } from "@/stores/eventStore";
import { usePredictStore } from "@/stores/predictStore";

interface TodoState {
  todos: Todo[];
  archivedTodos: Todo[];
  viewMode: ViewMode;
  filterTagIds: string[];
  selectionMode: boolean;
  selectedTodoIds: string[];
  editingTodoId: string | null;
  highlightedTodoId: string | null;
  _hydrated: boolean;
  _hydrate: (todos: Todo[], archivedTodos: Todo[]) => void;
  setViewMode: (mode: ViewMode) => void;
  toggleFilterTag: (tagId: string) => void;
  clearFilterTags: () => void;
  setSelectionMode: (enabled: boolean) => void;
  setSelectedTodoIds: (ids: string[]) => void;
  toggleTodoSelection: (id: string) => void;
  clearSelectedTodos: () => void;
  addTodo: (title: string, tagIds?: string[], targetDate?: string) => void;
  addTimelineTodo: (targetDate: string, start: string, end: string | null) => string | null;
  updateTodo: (id: string, updates: Partial<Omit<Todo, "id">>) => void;
  toggleTodo: (id: string, dateKey?: string) => void;
  deleteTodo: (id: string) => void;
  batchMoveSelected: (targetDate: string) => void;
  batchDeleteSelected: () => void;
  duplicateTodo: (id: string, targetDate: string) => string | null;
  reorderTodos: (activeId: string, overId: string, scopedIds?: string[]) => void;
  reorderSubtasks: (todoId: string, activeId: string, overId: string) => void;
  archiveCompleted: () => void;
  archiveBoardCompleted: (boardDate: string) => void;
  removeTagFromAllTodos: (tagId: string) => void;
  setEditingTodoId: (id: string | null) => void;
  setHighlightedTodoId: (id: string | null) => void;
  addSubtask: (todoId: string, title: string) => void;
  updateSubtaskTitle: (todoId: string, subtaskId: string, title: string) => void;
  toggleSubtask: (todoId: string, subtaskId: string) => void;
  deleteSubtask: (todoId: string, subtaskId: string) => void;
  addTimeSlot: (todoId: string) => void;
  removeTimeSlot: (todoId: string, slotId: string) => void;
  updateTimeSlot: (todoId: string, slotId: string, updates: Partial<Omit<TimeSlot, "id">>) => void;
  addRelation: (todoId: string, targetTaskId: string, relationType: TaskRelationType) => void;
  deleteRelation: (todoId: string, relationId: string) => void;
  endOfDay: (todayKey: string) => void;
  importTodos: (incoming: Todo[]) => number;
  importArchivedTodos: (incoming: Todo[]) => number;
}

type TodoRollbackState = Pick<TodoState, "todos" | "archivedTodos"> &
  Partial<Pick<TodoState, "editingTodoId" | "selectionMode" | "selectedTodoIds">>;
type TodoPersistSnapshot = Pick<TodoRollbackState, "todos" | "archivedTodos">;

function rollbackTodoState(previous: Partial<TodoRollbackState>, error: unknown) {
  useTodoStore.setState(previous);
  showErrorNotice(error);
}

function notifyPredictionDataChanged(delayMs = 300) {
  usePredictStore.getState().scheduleRefresh(delayMs);
}

function persistTodos(todos: Todo[]) {
  return backend.saveTodos(todos, false).then(() => {
    notifyPredictionDataChanged();
  });
}

function persistArchivedTodos(archived: Todo[]) {
  return backend.saveTodos(archived, true).then(() => {
    notifyPredictionDataChanged();
  });
}

function persistSingleTodo(todo: Todo, archived = false) {
  return backend.saveTodo(todo, archived).then(() => {
    notifyPredictionDataChanged();
  });
}

function persistTodoBatch(todos: Todo[], archived = false) {
  return Promise.all(todos.map((todo) => persistSingleTodo(todo, archived)));
}

function persistDeleteTodo(id: string) {
  return backend.deleteTodo(id).then(() => {
    notifyPredictionDataChanged();
  });
}

async function syncTodoCollections(current: TodoPersistSnapshot, target: TodoPersistSnapshot) {
  const currentIds = new Set([...current.todos, ...current.archivedTodos].map((todo) => todo.id));
  const targetIds = new Set([...target.todos, ...target.archivedTodos].map((todo) => todo.id));
  const idsToDelete = Array.from(currentIds).filter((id) => !targetIds.has(id));

  await Promise.all([
    persistTodos(target.todos),
    persistArchivedTodos(target.archivedTodos),
    ...idsToDelete.map((id) => persistDeleteTodo(id)),
  ]);
}

function restoreTodoSnapshot(target: TodoRollbackState) {
  const current = useTodoStore.getState();
  useTodoStore.setState({
    todos: target.todos,
    archivedTodos: target.archivedTodos,
    editingTodoId: target.editingTodoId ?? null,
    selectionMode: false,
    selectedTodoIds: [],
  });
  void syncTodoCollections(
    {
      todos: current.todos,
      archivedTodos: current.archivedTodos,
    },
    {
      todos: target.todos,
      archivedTodos: target.archivedTodos,
    },
  ).catch((error: unknown) => rollbackTodoState(target, error));
}

function getLocale() {
  return useSettingsStore.getState().locale;
}

function createHistoryTodo(
  todo: Todo,
  historyDate: string,
  historyKind: TodoHistoryKind,
  id = todo.id,
) {
  return withTodoDefaults({
    ...todo,
    id,
    completed: true,
    historyDate,
    historySourceTodoId: todo.historySourceTodoId ?? todo.id,
    historyKind,
  });
}

function stripRelationsToTargets(todo: Todo, targetIds: Set<string>): Todo {
  let next = todo;
  for (const targetId of targetIds) {
    next = stripRelationsToTarget(next, targetId);
  }
  return next;
}

function cloneTodoForDate(todo: Todo, targetDate: string, order: number): Todo {
  return withTodoDefaults({
    ...todo,
    id: nanoid(),
    targetDate,
    order,
    createdAt: Date.now(),
    completed: false,
    reminderMinsBefore: todo.reminderMinsBefore,
    completedDayKeys: [],
    archivedDayKeys: [],
    outgoingRelations: [],
    historyDate: null,
    historySourceTodoId: null,
    historyKind: null,
    timeSlots: todo.timeSlots.map((slot) => ({
      ...slot,
      id: nanoid(),
    })),
    subtasks: todo.subtasks.map((subtask, index) => ({
      ...subtask,
      id: nanoid(),
      completed: false,
      order: index,
    })),
  });
}

const now = Date.now();
const todayKey = getTodayDateKey();
const tomorrowKey = getTomorrowDateKey();
const yesterdayKey = shiftDateKey(todayKey, -1);
const twoDaysAgoKey = shiftDateKey(todayKey, -2);

const SEED_TODOS: Todo[] = [
  {
    id: "s1",
    title: "复现耳蜗模型频率选择性 Bug",
    completed: false,
    tagIds: ["tag-code", "tag-audio"],
    difficulty: 4,
    timeSlots: [],
    reminderMinsBefore: null,
    targetDate: twoDaysAgoKey,
    order: 0,
    createdAt: now,
    subtasks: [],
    durationDays: 1,
    completedDayKeys: [],
    archivedDayKeys: [],
    outgoingRelations: [],
    historyDate: null,
    historySourceTodoId: null,
    historyKind: null,
  },
  {
    id: "s2",
    title: "读完 Moore 2023 听觉掩蔽综述并做笔记",
    completed: false,
    tagIds: ["tag-paper", "tag-audio"],
    difficulty: 3,
    timeSlots: [],
    reminderMinsBefore: null,
    targetDate: yesterdayKey,
    order: 1,
    createdAt: now - 1000,
    subtasks: [
      { id: "st2a", title: "读摘要和结论", completed: false, order: 0 },
      { id: "st2b", title: "精读方法部分", completed: false, order: 1 },
      { id: "st2c", title: "整理关键公式和图表", completed: false, order: 2 },
      { id: "st2d", title: "写一页总结笔记", completed: false, order: 3 },
    ],
    durationDays: 1,
    completedDayKeys: [],
    archivedDayKeys: [],
    outgoingRelations: [],
    historyDate: null,
    historySourceTodoId: null,
    historyKind: null,
  },
  {
    id: "s3",
    title: "用 Python 跑一版 ABR 信号降噪 pipeline",
    completed: false,
    tagIds: ["tag-code", "tag-lab"],
    difficulty: 3,
    timeSlots: [{ id: "ts3a", start: "09:00", end: "11:00" }],
    reminderMinsBefore: 5,
    targetDate: todayKey,
    order: 2,
    createdAt: now - 2000,
    subtasks: [
      { id: "st3a", title: "准备 ABR 原始数据", completed: true, order: 0 },
      { id: "st3b", title: "实现带通滤波模块", completed: false, order: 1 },
      { id: "st3c", title: "对比降噪前后波形", completed: false, order: 2 },
    ],
    durationDays: 1,
    completedDayKeys: [],
    archivedDayKeys: [],
    outgoingRelations: [],
    historyDate: null,
    historySourceTodoId: null,
    historyKind: null,
  },
  {
    id: "s4",
    title: "写听力学课 Literature Review 大纲",
    completed: false,
    tagIds: ["tag-paper", "tag-audio"],
    difficulty: 3,
    timeSlots: [{ id: "ts4a", start: "13:30", end: "15:00" }],
    reminderMinsBefore: 5,
    targetDate: todayKey,
    order: 3,
    createdAt: now - 3000,
    subtasks: [
      { id: "st4a", title: "确定研究主题和关键词", completed: false, order: 0 },
      { id: "st4b", title: "PubMed/Web of Science 检索", completed: false, order: 1 },
      { id: "st4c", title: "筛选并整理 15–20 篇核心文献", completed: false, order: 2 },
      { id: "st4d", title: "按主题分类写大纲结构", completed: false, order: 3 },
    ],
    durationDays: 3,
    completedDayKeys: [],
    archivedDayKeys: [],
    outgoingRelations: [],
    historyDate: null,
    historySourceTodoId: null,
    historyKind: null,
  },
  {
    id: "s5",
    title: "Debug TinyDo 拖拽排序的边界情况",
    completed: false,
    tagIds: ["tag-code"],
    difficulty: 2,
    timeSlots: [{ id: "ts5a", start: "16:00", end: null }],
    reminderMinsBefore: null,
    targetDate: todayKey,
    order: 4,
    createdAt: now - 4000,
    subtasks: [],
    durationDays: 1,
    completedDayKeys: [],
    archivedDayKeys: [],
    outgoingRelations: [],
    historyDate: null,
    historySourceTodoId: null,
    historyKind: null,
  },
  {
    id: "s6",
    title: "去药店买维生素 D + 取快递",
    completed: false,
    tagIds: ["tag-errand"],
    difficulty: 1,
    timeSlots: [{ id: "ts6a", start: "18:00", end: null }],
    reminderMinsBefore: null,
    targetDate: todayKey,
    order: 5,
    createdAt: now - 5000,
    subtasks: [
      { id: "st6a", title: "列购物清单（维生素 D 规格）", completed: false, order: 0 },
      { id: "st6b", title: "去药店购买", completed: false, order: 1 },
      { id: "st6c", title: "顺路取快递", completed: false, order: 2 },
    ],
    durationDays: 1,
    completedDayKeys: [],
    archivedDayKeys: [],
    outgoingRelations: [],
    historyDate: null,
    historySourceTodoId: null,
    historyKind: null,
  },
  {
    id: "s7",
    title: "晨跑 3 公里 + 拉伸",
    completed: true,
    tagIds: ["tag-health"],
    difficulty: 2,
    timeSlots: [{ id: "ts7a", start: "07:00", end: "07:40" }],
    reminderMinsBefore: null,
    targetDate: todayKey,
    order: 6,
    createdAt: now - 6000,
    subtasks: [],
    durationDays: 1,
    completedDayKeys: [],
    archivedDayKeys: [],
    outgoingRelations: [],
    historyDate: null,
    historySourceTodoId: null,
    historyKind: null,
  },
  {
    id: "s8",
    title: "整理实验室 OAE 测试数据表",
    completed: true,
    tagIds: ["tag-lab", "tag-audio"],
    difficulty: 1,
    timeSlots: [{ id: "ts8a", start: "11:30", end: "12:00" }],
    reminderMinsBefore: null,
    targetDate: todayKey,
    order: 7,
    createdAt: now - 7000,
    subtasks: [],
    durationDays: 1,
    completedDayKeys: [],
    archivedDayKeys: [],
    outgoingRelations: [],
    historyDate: null,
    historySourceTodoId: null,
    historyKind: null,
  },
  {
    id: "s9",
    title: "准备周五 Journal Club 的 slides",
    completed: false,
    tagIds: ["tag-paper", "tag-audio"],
    difficulty: 2,
    timeSlots: [{ id: "ts9a", start: "10:00", end: "11:30" }],
    reminderMinsBefore: 5,
    targetDate: tomorrowKey,
    order: 8,
    createdAt: now - 8000,
    subtasks: [
      { id: "st9a", title: "选定要讲的文献", completed: false, order: 0 },
      { id: "st9b", title: "提炼背景、方法、结果要点", completed: false, order: 1 },
      { id: "st9c", title: "做 8–10 页 slides", completed: false, order: 2 },
      { id: "st9d", title: "预讲一遍控制时间", completed: false, order: 3 },
    ],
    durationDays: 1,
    completedDayKeys: [],
    archivedDayKeys: [],
    outgoingRelations: [],
    historyDate: null,
    historySourceTodoId: null,
    historyKind: null,
  },
  {
    id: "s10",
    title: "游泳 40 分钟 + 核心力量训练",
    completed: false,
    tagIds: ["tag-health"],
    difficulty: 2,
    timeSlots: [{ id: "ts10a", start: "19:00", end: "20:00" }],
    reminderMinsBefore: 10,
    targetDate: tomorrowKey,
    order: 9,
    createdAt: now - 9000,
    subtasks: [
      { id: "st10a", title: "游泳 40 分钟", completed: false, order: 0 },
      { id: "st10b", title: "平板支撑 3 组", completed: false, order: 1 },
      { id: "st10c", title: "卷腹 + 拉伸", completed: false, order: 2 },
    ],
    durationDays: 1,
    completedDayKeys: [],
    archivedDayKeys: [],
    outgoingRelations: [],
    historyDate: null,
    historySourceTodoId: null,
    historyKind: null,
  },
];

export { SEED_TODOS };

export const useTodoStore = create<TodoState>()((set, get) => ({
  todos: [],
  archivedTodos: [],
  viewMode: "all" as ViewMode,
  filterTagIds: [],
  selectionMode: false,
  selectedTodoIds: [],
  editingTodoId: null,
  highlightedTodoId: null,
  _hydrated: false,

  _hydrate: (todos, archivedTodos) =>
    set({
      todos: todos.map(withTodoDefaults),
      archivedTodos: archivedTodos.map(withTodoDefaults),
      _hydrated: true,
    }),

  setViewMode: (mode) => set({ viewMode: mode }),
  setEditingTodoId: (id) => set({ editingTodoId: id }),
  setHighlightedTodoId: (id) => set({ highlightedTodoId: id }),

  toggleFilterTag: (tagId) =>
    set((s) => ({
      filterTagIds: s.filterTagIds.includes(tagId)
        ? s.filterTagIds.filter((id) => id !== tagId)
        : [...s.filterTagIds, tagId],
    })),

  clearFilterTags: () => set({ filterTagIds: [] }),

  setSelectionMode: (enabled) =>
    set((s) => ({
      selectionMode: enabled,
      selectedTodoIds: enabled ? s.selectedTodoIds : [],
    })),

  setSelectedTodoIds: (ids) =>
    set({
      selectionMode: ids.length > 0,
      selectedTodoIds: Array.from(new Set(ids)),
    }),

  toggleTodoSelection: (id) =>
    set((s) => {
      const nextSelected = s.selectedTodoIds.includes(id)
        ? s.selectedTodoIds.filter((selectedId) => selectedId !== id)
        : [...s.selectedTodoIds, id];
      return {
        selectionMode: nextSelected.length > 0 || s.selectionMode,
        selectedTodoIds: nextSelected,
      };
    }),

  clearSelectedTodos: () => set({ selectionMode: false, selectedTodoIds: [] }),

  addTodo: (title, tagIds = [], targetDate = getTodayDateKey()) => {
    const previousTodos = get().todos;
    const todos = get().todos;
    const activeOrders = todos.filter((t) => !t.completed).map((t) => t.order);
    const minOrder = activeOrders.length > 0 ? Math.min(...activeOrders) : 0;
    const todo: Todo = {
      id: nanoid(),
      title,
      completed: false,
      tagIds,
      difficulty: 2 as Difficulty,
      timeSlots: [],
      reminderMinsBefore: null,
      targetDate,
      order: minOrder - 1,
      createdAt: Date.now(),
      subtasks: [],
      durationDays: 1,
      completedDayKeys: [],
      archivedDayKeys: [],
      outgoingRelations: [],
      historyDate: null,
      historySourceTodoId: null,
      historyKind: null,
    };
    set((s) => ({ todos: [todo, ...s.todos] }));
    recordEvent(todo.id, "created");
    void persistSingleTodo(todo).catch((error: unknown) => {
      rollbackTodoState({ todos: previousTodos }, error);
    });
  },

  addTimelineTodo: (targetDate, start, end) => {
    const previous = {
      todos: get().todos,
      editingTodoId: get().editingTodoId,
      selectionMode: get().selectionMode,
      selectedTodoIds: get().selectedTodoIds,
    };
    const activeOrders = get()
      .todos.filter((todo) => !todo.completed)
      .map((todo) => todo.order);
    const minOrder = activeOrders.length > 0 ? Math.min(...activeOrders) : 0;
    const locale = getLocale();
    const todo: Todo = {
      id: nanoid(),
      title: t("timeline.new_task", locale),
      completed: false,
      tagIds: [],
      difficulty: 2 as Difficulty,
      timeSlots: [{ id: nanoid(), start, end }],
      reminderMinsBefore: null,
      targetDate,
      order: minOrder - 1,
      createdAt: Date.now(),
      subtasks: [],
      durationDays: 1,
      completedDayKeys: [],
      archivedDayKeys: [],
      outgoingRelations: [],
      historyDate: null,
      historySourceTodoId: null,
      historyKind: null,
    };
    set((s) => ({
      todos: [todo, ...s.todos],
      editingTodoId: todo.id,
      selectionMode: false,
      selectedTodoIds: [],
    }));
    recordEvent(todo.id, "created");
    showSuccessNotice(t("notice.timeline_task_created", locale));
    void persistSingleTodo(todo).catch((error: unknown) => rollbackTodoState(previous, error));
    return todo.id;
  },

  updateTodo: (id, updates) => {
    const before = get().todos.find((t) => t.id === id);
    set((s) => ({ todos: s.todos.map((t) => (t.id === id ? { ...t, ...updates } : t)) }));
    const updated = get().todos.find((t) => t.id === id);
    if (before && updated) {
      if ("title" in updates && updates.title !== before.title)
        recordEvent(id, "titleChanged", "title", before.title, updates.title);
      if ("difficulty" in updates && updates.difficulty !== before.difficulty)
        recordEvent(id, "difficultyChanged", "difficulty", before.difficulty, updates.difficulty);
      if (
        "reminderMinsBefore" in updates &&
        updates.reminderMinsBefore !== before.reminderMinsBefore
      )
        recordEvent(
          id,
          "reminderChanged",
          "reminderMinsBefore",
          before.reminderMinsBefore,
          updates.reminderMinsBefore,
        );
      if ("durationDays" in updates && updates.durationDays !== before.durationDays)
        recordEvent(
          id,
          "durationChanged",
          "durationDays",
          before.durationDays,
          updates.durationDays,
        );
      if ("targetDate" in updates && updates.targetDate !== before.targetDate) {
        const tomorrow = getTomorrowDateKey();
        const evtType = updates.targetDate === tomorrow ? "movedToTomorrow" : "dateChanged";
        recordEvent(id, evtType, "targetDate", before.targetDate, updates.targetDate);
      }
      if ("tagIds" in updates) {
        const oldSet = new Set(before.tagIds);
        const newSet = new Set(updates.tagIds ?? []);
        for (const tagId of updates.tagIds ?? []) {
          if (!oldSet.has(tagId)) recordEvent(id, "tagAdded", "tagIds", null, tagId);
        }
        for (const tagId of before.tagIds) {
          if (!newSet.has(tagId)) recordEvent(id, "tagRemoved", "tagIds", tagId, null);
        }
      }
      void persistSingleTodo(updated).catch((error: unknown) => showErrorNotice(error));
    }
  },

  toggleTodo: (id, dateKey) => {
    const previousTodos = get().todos;
    const before = get().todos.find((t) => t.id === id);
    set((s) => ({
      todos: s.todos.map((t) => {
        if (t.id !== id) return t;
        const dur = t.durationDays;
        if (dur > 1 && dateKey) {
          const keys = t.completedDayKeys;
          const alreadyDone = keys.includes(dateKey);
          const nextKeys = alreadyDone ? keys.filter((k) => k !== dateKey) : [...keys, dateKey];
          const allDone = nextKeys.length >= dur;
          return {
            ...t,
            completedDayKeys: nextKeys,
            completed: allDone,
            subtasks: allDone ? t.subtasks.map((st) => ({ ...st, completed: true })) : t.subtasks,
          };
        }
        const next = !t.completed;
        return {
          ...t,
          completed: next,
          subtasks: next ? t.subtasks.map((st) => ({ ...st, completed: true })) : t.subtasks,
        };
      }),
    }));
    const updated = get().todos.find((t) => t.id === id);
    if (updated && before) {
      recordEvent(id, updated.completed ? "completed" : "uncompleted");
      void persistSingleTodo(updated).catch((error: unknown) => {
        rollbackTodoState({ todos: previousTodos }, error);
      });
    }
  },

  deleteTodo: (id) => {
    recordEvent(id, "deleted");
    const previous = {
      todos: get().todos,
      archivedTodos: get().archivedTodos,
      editingTodoId: get().editingTodoId,
    };
    const deletedTodo = previous.todos.find((todo) => todo.id === id);
    const updatedActive = previous.todos
      .filter((todo) => todo.id !== id)
      .map((todo) => stripRelationsToTarget(todo, id));
    const updatedArchived = previous.archivedTodos.map((todo) => stripRelationsToTarget(todo, id));
    const activeRelationCleanup = previous.todos
      .filter(
        (todo) =>
          todo.id !== id && todo.outgoingRelations.some((relation) => relation.targetTaskId === id),
      )
      .map((todo) => stripRelationsToTarget(todo, id));
    const archivedRelationCleanup = previous.archivedTodos
      .filter((todo) => todo.outgoingRelations.some((relation) => relation.targetTaskId === id))
      .map((todo) => stripRelationsToTarget(todo, id));
    set((s) => ({
      todos: updatedActive,
      archivedTodos: updatedArchived,
      editingTodoId: s.editingTodoId === id ? null : s.editingTodoId,
      selectedTodoIds: s.selectedTodoIds.filter((selectedId) => selectedId !== id),
    }));
    const locale = getLocale();
    showUndoNotice(
      t("notice.todo_deleted", locale, {
        title: deletedTodo?.title ?? t("detail.title", locale),
      }),
      t("notice.undo", locale),
      () => restoreTodoSnapshot(previous),
    );
    void Promise.all([
      persistDeleteTodo(id),
      persistTodoBatch(activeRelationCleanup, false),
      persistTodoBatch(archivedRelationCleanup, true),
    ]).catch((error: unknown) => rollbackTodoState(previous, error));
  },

  batchMoveSelected: (targetDate) => {
    const selectedIds = new Set(get().selectedTodoIds);
    if (selectedIds.size === 0) return;
    const tomorrow = getTomorrowDateKey();
    for (const selId of selectedIds) {
      const todo = get().todos.find((t) => t.id === selId);
      if (todo && todo.targetDate !== targetDate) {
        const evtType = targetDate === tomorrow ? "movedToTomorrow" : "dateChanged";
        recordEvent(selId, evtType, "targetDate", todo.targetDate, targetDate);
      }
    }
    const previous = {
      todos: get().todos,
      archivedTodos: get().archivedTodos,
      editingTodoId: get().editingTodoId,
      selectionMode: get().selectionMode,
      selectedTodoIds: get().selectedTodoIds,
    };
    set((s) => ({
      todos: s.todos.map((todo) => {
        if (!selectedIds.has(todo.id)) return todo;
        return {
          ...todo,
          targetDate,
          ...(todo.durationDays > 1 ||
          todo.completedDayKeys.length > 0 ||
          todo.archivedDayKeys.length > 0
            ? {
                completed: false,
                completedDayKeys: [],
                archivedDayKeys: [],
              }
            : {}),
        };
      }),
      selectionMode: false,
      selectedTodoIds: [],
    }));
    const updated = get().todos.filter((todo) => selectedIds.has(todo.id));
    const locale = getLocale();
    showSuccessNotice(t("notice.moved_items", locale, { n: updated.length }));
    void persistTodoBatch(updated, false).catch((error: unknown) =>
      rollbackTodoState(previous, error),
    );
  },

  batchDeleteSelected: () => {
    const selectedIds = new Set(get().selectedTodoIds);
    if (selectedIds.size === 0) return;
    for (const selId of selectedIds) {
      recordEvent(selId, "deleted");
    }
    const previous = {
      todos: get().todos,
      archivedTodos: get().archivedTodos,
      editingTodoId: get().editingTodoId,
      selectionMode: get().selectionMode,
      selectedTodoIds: get().selectedTodoIds,
    };
    const updatedActive = previous.todos
      .filter((todo) => !selectedIds.has(todo.id))
      .map((todo) => stripRelationsToTargets(todo, selectedIds));
    const updatedArchived = previous.archivedTodos.map((todo) =>
      stripRelationsToTargets(todo, selectedIds),
    );
    const activeRelationCleanup = previous.todos
      .filter(
        (todo) =>
          !selectedIds.has(todo.id) &&
          todo.outgoingRelations.some((relation) => selectedIds.has(relation.targetTaskId)),
      )
      .map((todo) => stripRelationsToTargets(todo, selectedIds));
    const archivedRelationCleanup = previous.archivedTodos
      .filter((todo) =>
        todo.outgoingRelations.some((relation) => selectedIds.has(relation.targetTaskId)),
      )
      .map((todo) => stripRelationsToTargets(todo, selectedIds));
    set({
      todos: updatedActive,
      archivedTodos: updatedArchived,
      editingTodoId:
        previous.editingTodoId && selectedIds.has(previous.editingTodoId)
          ? null
          : previous.editingTodoId,
      selectionMode: false,
      selectedTodoIds: [],
    });
    const locale = getLocale();
    showUndoNotice(
      t("notice.deleted_items", locale, { n: selectedIds.size }),
      t("notice.undo", locale),
      () => restoreTodoSnapshot(previous),
    );
    void Promise.all([
      ...Array.from(selectedIds).map((todoId) => persistDeleteTodo(todoId)),
      persistTodoBatch(activeRelationCleanup, false),
      persistTodoBatch(archivedRelationCleanup, true),
    ]).catch((error: unknown) => rollbackTodoState(previous, error));
  },

  duplicateTodo: (id, targetDate) => {
    const previous = {
      todos: get().todos,
      editingTodoId: get().editingTodoId,
      selectionMode: get().selectionMode,
      selectedTodoIds: get().selectedTodoIds,
    };
    const source = get().todos.find((todo) => todo.id === id);
    if (!source) return null;
    const activeOrders = get()
      .todos.filter((todo) => !todo.completed)
      .map((todo) => todo.order);
    const minOrder = activeOrders.length > 0 ? Math.min(...activeOrders) : 0;
    const duplicated = cloneTodoForDate(source, targetDate, minOrder - 1);
    set((s) => ({
      todos: [duplicated, ...s.todos],
      editingTodoId: duplicated.id,
      selectionMode: false,
      selectedTodoIds: [],
    }));
    recordEvent(duplicated.id, "duplicated", null, null, id);
    const locale = getLocale();
    showSuccessNotice(t("notice.duplicated_item", locale));
    void persistSingleTodo(duplicated).catch((error: unknown) =>
      rollbackTodoState(previous, error),
    );
    return duplicated.id;
  },

  reorderTodos: (activeId, overId, scopedIds) => {
    const previousTodos = get().todos;
    set((s) => {
      const scopeSet = new Set(scopedIds ?? s.todos.map((todo) => todo.id));
      const scopedTodos = s.todos
        .filter((todo) => scopeSet.has(todo.id))
        .slice()
        .sort((a, b) => a.order - b.order);

      const activeIdx = scopedTodos.findIndex((t) => t.id === activeId);
      const overIdx = scopedTodos.findIndex((t) => t.id === overId);
      if (activeIdx === -1 || overIdx === -1) return s;

      const reordered = [...scopedTodos];
      const [moved] = reordered.splice(activeIdx, 1);
      reordered.splice(overIdx, 0, moved);

      const orderSlots = scopedTodos.map((todo) => todo.order).sort((a, b) => a - b);
      const nextOrderMap = new Map(reordered.map((todo, index) => [todo.id, orderSlots[index]]));

      return {
        todos: s.todos.map((todo) => {
          const nextOrder = nextOrderMap.get(todo.id);
          return nextOrder === undefined ? todo : { ...todo, order: nextOrder };
        }),
      };
    });
    void persistTodos(get().todos).catch((error: unknown) => {
      rollbackTodoState({ todos: previousTodos }, error);
    });
  },

  reorderSubtasks: (todoId, activeId, overId) => {
    const previousTodos = get().todos;
    set((s) => ({
      todos: s.todos.map((t) => {
        if (t.id !== todoId) return t;
        const subs = [...t.subtasks].sort((a, b) => a.order - b.order);
        const activeIdx = subs.findIndex((st) => st.id === activeId);
        const overIdx = subs.findIndex((st) => st.id === overId);
        if (activeIdx === -1 || overIdx === -1) return t;
        const [moved] = subs.splice(activeIdx, 1);
        subs.splice(overIdx, 0, moved);
        return {
          ...t,
          subtasks: subs.map((st, i) => ({ ...st, order: i })),
        };
      }),
    }));
    const updated = get().todos.find((t) => t.id === todoId);
    if (updated) {
      void persistSingleTodo(updated).catch((error: unknown) => {
        rollbackTodoState({ todos: previousTodos }, error);
      });
    }
  },

  archiveCompleted: () => {
    const previous = {
      todos: get().todos,
      archivedTodos: get().archivedTodos,
      editingTodoId: get().editingTodoId,
    };
    const historyDate = getTodayDateKey();
    const done = get()
      .todos.filter((t) => t.completed)
      .map((t) => createHistoryTodo(t, historyDate, "completed"));
    if (done.length === 0) return;
    for (const d of done) recordEvent(d.id, "archived");
    const doneIds = new Set(done.map((todo) => todo.id));
    set((s) => ({
      todos: s.todos
        .filter((t) => !t.completed)
        .map((todo) =>
          Array.from(doneIds).reduce(
            (current, archivedId) => stripRelationsToTarget(current, archivedId),
            todo,
          ),
        ),
      archivedTodos: [...s.archivedTodos, ...done],
    }));
    const locale = getLocale();
    showUndoNotice(
      t("notice.archived_items", locale, { n: done.length }),
      t("notice.undo", locale),
      () => restoreTodoSnapshot(previous),
    );
    const nextState = get();
    const relationCleanup = nextState.todos.filter((todo) =>
      previous.todos.some(
        (previousTodo) =>
          previousTodo.id === todo.id &&
          previousTodo.outgoingRelations.some((relation) => doneIds.has(relation.targetTaskId)),
      ),
    );
    void Promise.all([
      persistTodoBatch(done, true),
      persistTodoBatch(relationCleanup, false),
    ]).catch((error: unknown) => rollbackTodoState(previous, error));
  },

  archiveBoardCompleted: (boardDate) => {
    const previous = {
      todos: get().todos,
      archivedTodos: get().archivedTodos,
      editingTodoId: get().editingTodoId,
    };
    const todayK = getTodayDateKey();
    const isToday = boardDate === todayK;
    const dailySnapshotKeys = new Set(
      previous.archivedTodos
        .filter((todo) => todo.historyKind === "dailyProgress")
        .map(
          (todo) => `${todo.historySourceTodoId ?? todo.id}:${todo.historyDate ?? todo.targetDate}`,
        ),
    );

    const fullArchives = previous.todos.filter((todo) => {
      if (!todo.completed) return false;
      if (isToday) return todo.targetDate <= todayK;
      const endDate = shiftDateKey(todo.targetDate, todo.durationDays - 1);
      return todo.targetDate <= boardDate && endDate >= boardDate;
    });
    const dailySnapshotSourceIds = new Set<string>();
    const dailySnapshots = previous.todos.flatMap((todo) => {
      if (todo.durationDays <= 1 || todo.completed) return [];
      if (!todo.completedDayKeys.includes(boardDate) || todo.archivedDayKeys.includes(boardDate))
        return [];
      const snapshotKey = `${todo.id}:${boardDate}`;
      dailySnapshotSourceIds.add(todo.id);
      if (dailySnapshotKeys.has(snapshotKey)) return [];
      return [createHistoryTodo(todo, boardDate, "dailyProgress", nanoid())];
    });

    if (fullArchives.length === 0 && dailySnapshotSourceIds.size === 0) return;
    for (const fa of fullArchives) recordEvent(fa.id, "archived");

    const fullArchiveIds = new Set(fullArchives.map((todo) => todo.id));

    set((s) => ({
      todos: s.todos
        .filter((todo) => !fullArchiveIds.has(todo.id))
        .map((todo) => {
          const withArchivedDay = dailySnapshotSourceIds.has(todo.id)
            ? withTodoDefaults({
                ...todo,
                archivedDayKeys: Array.from(new Set([...todo.archivedDayKeys, boardDate])),
              })
            : todo;
          return Array.from(fullArchiveIds).reduce(
            (current, archivedId) => stripRelationsToTarget(current, archivedId),
            withArchivedDay,
          );
        }),
      archivedTodos: [
        ...s.archivedTodos,
        ...fullArchives.map((todo) => createHistoryTodo(todo, boardDate, "completed")),
        ...dailySnapshots,
      ],
    }));

    const nextState = get();
    const updatedSources = nextState.todos.filter(
      (todo) =>
        dailySnapshotSourceIds.has(todo.id) ||
        previous.todos.some(
          (previousTodo) =>
            previousTodo.id === todo.id &&
            previousTodo.outgoingRelations.some((relation) =>
              fullArchiveIds.has(relation.targetTaskId),
            ),
        ),
    );
    const archivedToSave = [
      ...fullArchives.map((todo) => createHistoryTodo(todo, boardDate, "completed")),
      ...dailySnapshots,
    ];
    const archivedCount = fullArchives.length + dailySnapshotSourceIds.size;
    const locale = getLocale();
    showUndoNotice(
      t("notice.archived_items", locale, { n: archivedCount }),
      t("notice.undo", locale),
      () => restoreTodoSnapshot(previous),
    );

    void Promise.all([
      persistTodoBatch(updatedSources, false),
      persistTodoBatch(archivedToSave, true),
    ]).catch((error: unknown) => rollbackTodoState(previous, error));
  },

  removeTagFromAllTodos: (tagId) => {
    const previousTodos = get().todos;
    set((s) => ({
      todos: s.todos.map((t) => ({ ...t, tagIds: t.tagIds.filter((id) => id !== tagId) })),
    }));
    void persistTodos(get().todos).catch((error: unknown) => {
      rollbackTodoState({ todos: previousTodos }, error);
    });
  },

  addSubtask: (todoId, title) => {
    const previousTodos = get().todos;
    set((s) => ({
      todos: s.todos.map((t) => {
        if (t.id !== todoId) return t;
        const subs = t.subtasks;
        const maxOrder = subs.length > 0 ? Math.max(...subs.map((st) => st.order)) : -1;
        return {
          ...t,
          subtasks: [...subs, { id: nanoid(), title, completed: false, order: maxOrder + 1 }],
        };
      }),
    }));
    recordEvent(todoId, "subtaskAdded", null, null, title);
    const updated = get().todos.find((t) => t.id === todoId);
    if (updated) {
      void persistSingleTodo(updated).catch((error: unknown) => {
        rollbackTodoState({ todos: previousTodos }, error);
      });
    }
  },

  updateSubtaskTitle: (todoId, subtaskId, title) => {
    const previousTodos = get().todos;
    const oldSub = get()
      .todos.find((t) => t.id === todoId)
      ?.subtasks.find((s) => s.id === subtaskId);
    set((s) => ({
      todos: s.todos.map((todo) => {
        if (todo.id !== todoId) return todo;
        return {
          ...todo,
          subtasks: todo.subtasks.map((subtask) =>
            subtask.id === subtaskId ? { ...subtask, title } : subtask,
          ),
        };
      }),
    }));
    if (oldSub && oldSub.title !== title) {
      recordEvent(todoId, "subtaskRenamed", subtaskId, oldSub.title, title);
    }
    const updated = get().todos.find((todo) => todo.id === todoId);
    if (updated) {
      void persistSingleTodo(updated).catch((error: unknown) => {
        rollbackTodoState({ todos: previousTodos }, error);
      });
    }
  },

  toggleSubtask: (todoId, subtaskId) => {
    const previousTodos = get().todos;
    const oldSub = get()
      .todos.find((t) => t.id === todoId)
      ?.subtasks.find((s) => s.id === subtaskId);
    set((s) => ({
      todos: s.todos.map((t) => {
        if (t.id !== todoId) return t;
        return {
          ...t,
          subtasks: t.subtasks.map((st) =>
            st.id === subtaskId ? { ...st, completed: !st.completed } : st,
          ),
        };
      }),
    }));
    recordEvent(todoId, "subtaskToggled", subtaskId, oldSub?.completed, !oldSub?.completed);
    const updated = get().todos.find((t) => t.id === todoId);
    if (updated) {
      void persistSingleTodo(updated).catch((error: unknown) => {
        rollbackTodoState({ todos: previousTodos }, error);
      });
    }
  },

  deleteSubtask: (todoId, subtaskId) => {
    const previousTodos = get().todos;
    const oldSub = get()
      .todos.find((t) => t.id === todoId)
      ?.subtasks.find((s) => s.id === subtaskId);
    set((s) => ({
      todos: s.todos.map((t) => {
        if (t.id !== todoId) return t;
        return { ...t, subtasks: t.subtasks.filter((st) => st.id !== subtaskId) };
      }),
    }));
    recordEvent(todoId, "subtaskRemoved", subtaskId, oldSub?.title, null);
    const updated = get().todos.find((t) => t.id === todoId);
    if (updated) {
      void persistSingleTodo(updated).catch((error: unknown) => {
        rollbackTodoState({ todos: previousTodos }, error);
      });
    }
  },

  addRelation: (todoId, targetTaskId, relationType) => {
    const previousTodos = get().todos;
    set((s) => ({
      todos: s.todos.map((todo) => {
        if (todo.id !== todoId) return todo;
        if (!s.todos.some((candidate) => candidate.id === targetTaskId)) return todo;
        if (
          todo.id === targetTaskId ||
          todo.outgoingRelations.some(
            (relation) =>
              relation.targetTaskId === targetTaskId && relation.relationType === relationType,
          )
        ) {
          return todo;
        }
        return {
          ...todo,
          outgoingRelations: [
            ...todo.outgoingRelations,
            { id: nanoid(), targetTaskId, relationType },
          ],
        };
      }),
    }));
    recordEvent(todoId, "relationAdded", null, null, { targetTaskId, relationType });
    const updated = get().todos.find((todo) => todo.id === todoId);
    if (updated) {
      void persistSingleTodo(updated).catch((error: unknown) => {
        rollbackTodoState({ todos: previousTodos }, error);
      });
    }
  },

  deleteRelation: (todoId, relationId) => {
    const previousTodos = get().todos;
    const oldRel = get()
      .todos.find((t) => t.id === todoId)
      ?.outgoingRelations.find((r) => r.id === relationId);
    set((s) => ({
      todos: s.todos.map((todo) => {
        if (todo.id !== todoId) return todo;
        return {
          ...todo,
          outgoingRelations: todo.outgoingRelations.filter(
            (relation) => relation.id !== relationId,
          ),
        };
      }),
    }));
    if (oldRel) {
      recordEvent(
        todoId,
        "relationRemoved",
        null,
        { targetTaskId: oldRel.targetTaskId, relationType: oldRel.relationType },
        null,
      );
    }
    const updated = get().todos.find((todo) => todo.id === todoId);
    if (updated) {
      void persistSingleTodo(updated).catch((error: unknown) => {
        rollbackTodoState({ todos: previousTodos }, error);
      });
    }
  },

  addTimeSlot: (todoId) => {
    const previousTodos = get().todos;
    set((s) => ({
      todos: s.todos.map((t) => {
        if (t.id !== todoId) return t;
        const slot: TimeSlot = { id: nanoid(), start: "09:00", end: null };
        return { ...t, timeSlots: [...t.timeSlots, slot] };
      }),
    }));
    recordEvent(todoId, "timeSlotAdded");
    const updated = get().todos.find((t) => t.id === todoId);
    if (updated) {
      void persistSingleTodo(updated).catch((error: unknown) => {
        rollbackTodoState({ todos: previousTodos }, error);
      });
    }
  },

  removeTimeSlot: (todoId, slotId) => {
    const previousTodos = get().todos;
    set((s) => ({
      todos: s.todos.map((t) => {
        if (t.id !== todoId) return t;
        return { ...t, timeSlots: t.timeSlots.filter((sl) => sl.id !== slotId) };
      }),
    }));
    recordEvent(todoId, "timeSlotRemoved", slotId);
    const updated = get().todos.find((t) => t.id === todoId);
    if (updated) {
      void persistSingleTodo(updated).catch((error: unknown) => {
        rollbackTodoState({ todos: previousTodos }, error);
      });
    }
  },

  updateTimeSlot: (todoId, slotId, updates) => {
    const previousTodos = get().todos;
    const oldSlot = get()
      .todos.find((t) => t.id === todoId)
      ?.timeSlots.find((s) => s.id === slotId);
    set((s) => ({
      todos: s.todos.map((t) => {
        if (t.id !== todoId) return t;
        return {
          ...t,
          timeSlots: t.timeSlots.map((sl) => (sl.id === slotId ? { ...sl, ...updates } : sl)),
        };
      }),
    }));
    recordEvent(
      todoId,
      "timeSlotChanged",
      slotId,
      oldSlot ? { start: oldSlot.start, end: oldSlot.end } : null,
      updates,
    );
    const updated = get().todos.find((t) => t.id === todoId);
    if (updated) {
      void persistSingleTodo(updated).catch((error: unknown) => {
        rollbackTodoState({ todos: previousTodos }, error);
      });
    }
  },

  importTodos: (incoming) => {
    const previousTodos = get().todos;
    let count = 0;
    set((s) => {
      const existingMap = new Map(s.todos.map((t) => [t.id, t]));
      for (const t of incoming) {
        existingMap.set(
          t.id,
          withTodoDefaults({
            ...t,
            subtasks: t.subtasks.map((st) => ({ ...st, order: st.order })),
            timeSlots: t.timeSlots,
            durationDays: t.durationDays,
            completedDayKeys: t.completedDayKeys,
          }),
        );
        count++;
      }
      return { todos: Array.from(existingMap.values()) };
    });
    void persistTodos(get().todos).catch((error: unknown) => {
      rollbackTodoState({ todos: previousTodos }, error);
    });
    return count;
  },

  importArchivedTodos: (incoming) => {
    const previousArchivedTodos = get().archivedTodos;
    let count = 0;
    set((s) => {
      const existingMap = new Map(s.archivedTodos.map((t) => [t.id, t]));
      for (const t of incoming) {
        existingMap.set(
          t.id,
          withTodoDefaults({
            ...t,
            subtasks: t.subtasks.map((st) => ({ ...st, order: st.order })),
            timeSlots: t.timeSlots,
            durationDays: t.durationDays,
            completedDayKeys: t.completedDayKeys,
          }),
        );
        count++;
      }
      return { archivedTodos: Array.from(existingMap.values()) };
    });
    void persistArchivedTodos(get().archivedTodos).catch((error: unknown) => {
      rollbackTodoState({ archivedTodos: previousArchivedTodos }, error);
    });
    return count;
  },

  endOfDay: (todayKey) => {
    const previous = {
      todos: get().todos,
      archivedTodos: get().archivedTodos,
    };

    const existingSnapshotKeys = new Set(
      previous.archivedTodos
        .filter((todo) => todo.historyKind === "dailyProgress")
        .map(
          (todo) => `${todo.historySourceTodoId ?? todo.id}:${todo.historyDate ?? todo.targetDate}`,
        ),
    );

    const newArchived: Todo[] = [];
    const carryForwardIds: string[] = [];
    const removedIds: string[] = [];

    set((s) => {
      const nextTodos: Todo[] = [];

      for (const td of s.todos) {
        const endDate = shiftDateKey(td.targetDate, Math.max(0, td.durationDays - 1));
        const isPast = endDate < todayKey;

        if (!isPast) {
          if (td.durationDays > 1 && td.targetDate < todayKey) {
            let updated = td;
            for (const dayKey of td.completedDayKeys) {
              if (dayKey >= todayKey) continue;
              if (updated.archivedDayKeys.includes(dayKey)) continue;
              const snapshotKey = `${td.id}:${dayKey}`;
              if (!existingSnapshotKeys.has(snapshotKey)) {
                newArchived.push(createHistoryTodo(td, dayKey, "dailyProgress", nanoid()));
              }
              updated = withTodoDefaults({
                ...updated,
                archivedDayKeys: [...updated.archivedDayKeys, dayKey],
              });
            }
            nextTodos.push(updated);
          } else {
            nextTodos.push(td);
          }
          continue;
        }

        // --- past completed tasks (single-day or multi-day): archive ---
        if (td.completed) {
          recordEvent(td.id, "archived");
          newArchived.push(
            createHistoryTodo(td, td.durationDays > 1 ? endDate : td.targetDate, "completed"),
          );
          removedIds.push(td.id);
          continue;
        }

        // --- past multi-day incomplete tasks: snapshot completed days, carry forward ---
        if (td.durationDays > 1) {
          for (const dayKey of td.completedDayKeys) {
            if (td.archivedDayKeys.includes(dayKey)) continue;
            const snapshotKey = `${td.id}:${dayKey}`;
            if (existingSnapshotKeys.has(snapshotKey)) continue;
            newArchived.push(createHistoryTodo(td, dayKey, "dailyProgress", nanoid()));
          }
          recordEvent(td.id, "dateChanged", "targetDate", td.targetDate, todayKey);
          carryForwardIds.push(td.id);
          nextTodos.push(
            withTodoDefaults({
              ...td,
              targetDate: todayKey,
              completed: false,
              completedDayKeys: [],
              archivedDayKeys: [],
              durationDays: 1,
            }),
          );
          continue;
        }

        // --- past single-day incomplete with subtasks: split ---
        if (td.subtasks.length > 0) {
          const done = td.subtasks.filter((st) => st.completed);
          const pending = td.subtasks.filter((st) => !st.completed);
          if (done.length > 0) {
            const splitDone = withTodoDefaults({
              ...td,
              id: nanoid(),
              completed: true,
              subtasks: done,
              targetDate: td.targetDate,
              outgoingRelations: [],
            });
            recordEvent(splitDone.id, "archived");
            newArchived.push(createHistoryTodo(splitDone, td.targetDate, "completed"));
          }
          if (pending.length > 0) {
            recordEvent(td.id, "dateChanged", "targetDate", td.targetDate, todayKey);
            carryForwardIds.push(td.id);
            nextTodos.push(
              withTodoDefaults({
                ...td,
                targetDate: todayKey,
                completed: false,
                subtasks: pending,
              }),
            );
          } else {
            removedIds.push(td.id);
          }
          continue;
        }

        // --- past single-day incomplete without subtasks: carry forward ---
        recordEvent(td.id, "dateChanged", "targetDate", td.targetDate, todayKey);
        carryForwardIds.push(td.id);
        nextTodos.push(withTodoDefaults({ ...td, targetDate: todayKey }));
      }

      const archivedIds = new Set(newArchived.map((a) => a.historySourceTodoId ?? a.id));
      const cleanedTodos = nextTodos.map((todo) =>
        Array.from(archivedIds).reduce(
          (current, archivedId) => stripRelationsToTarget(current, archivedId),
          todo,
        ),
      );

      return {
        todos: cleanedTodos,
        archivedTodos: [...s.archivedTodos, ...newArchived],
      };
    });

    if (newArchived.length === 0 && carryForwardIds.length === 0 && removedIds.length === 0) return;

    const nextState = get();
    const changedTodos = nextState.todos.filter(
      (todo) =>
        carryForwardIds.includes(todo.id) ||
        previous.todos.some(
          (prev) =>
            prev.id === todo.id &&
            (prev.archivedDayKeys.length !== todo.archivedDayKeys.length ||
              prev.targetDate !== todo.targetDate),
        ),
    );

    void Promise.all([
      persistTodoBatch(changedTodos, false),
      persistTodoBatch(newArchived, true),
      ...removedIds.map((id) => persistDeleteTodo(id)),
    ]).catch((error: unknown) => rollbackTodoState(previous, error));
  },
}));
