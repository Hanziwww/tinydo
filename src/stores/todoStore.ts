import { create } from "zustand";
import { persist } from "zustand/middleware";
import { nanoid } from "nanoid";
import type { Todo, ViewMode, Difficulty } from "@/types";
import { getTodayDateKey, getTomorrowDateKey, shiftDateKey } from "@/lib/utils";

interface TodoState {
  todos: Todo[];
  archivedTodos: Todo[];
  viewMode: ViewMode;
  filterTagIds: string[];
  editingTodoId: string | null;
  setViewMode: (mode: ViewMode) => void;
  toggleFilterTag: (tagId: string) => void;
  clearFilterTags: () => void;
  addTodo: (title: string, tagIds?: string[], targetDate?: string) => void;
  updateTodo: (id: string, updates: Partial<Omit<Todo, "id">>) => void;
  toggleTodo: (id: string, dateKey?: string) => void;
  deleteTodo: (id: string) => void;
  reorderTodos: (activeId: string, overId: string, scopedIds?: string[]) => void;
  reorderSubtasks: (todoId: string, activeId: string, overId: string) => void;
  archiveCompleted: () => void;
  archiveBoardCompleted: (boardDate: string) => void;
  removeTagFromAllTodos: (tagId: string) => void;
  setEditingTodoId: (id: string | null) => void;
  addSubtask: (todoId: string, title: string) => void;
  toggleSubtask: (todoId: string, subtaskId: string) => void;
  deleteSubtask: (todoId: string, subtaskId: string) => void;
  splitOverdueSubtasks: (todayKey: string) => void;
  importTodos: (incoming: Todo[]) => number;
  importArchivedTodos: (incoming: Todo[]) => number;
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
    timeStart: null,
    timeEnd: null,
    reminderMinsBefore: null,
    targetDate: twoDaysAgoKey,
    order: 0,
    createdAt: now,
    subtasks: [],
    durationDays: 1,
    completedDayKeys: [],
  },
  {
    id: "s2",
    title: "读完 Moore 2023 听觉掩蔽综述并做笔记",
    completed: false,
    tagIds: ["tag-paper", "tag-audio"],
    difficulty: 3,
    timeStart: null,
    timeEnd: null,
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
  },
  {
    id: "s3",
    title: "用 Python 跑一版 ABR 信号降噪 pipeline",
    completed: false,
    tagIds: ["tag-code", "tag-lab"],
    difficulty: 3,
    timeStart: "09:00",
    timeEnd: "11:00",
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
  },
  {
    id: "s4",
    title: "写听力学课 Literature Review 大纲",
    completed: false,
    tagIds: ["tag-paper", "tag-audio"],
    difficulty: 3,
    timeStart: "13:30",
    timeEnd: "15:00",
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
  },
  {
    id: "s5",
    title: "Debug TinyDo 拖拽排序的边界情况",
    completed: false,
    tagIds: ["tag-code"],
    difficulty: 2,
    timeStart: "16:00",
    timeEnd: null,
    reminderMinsBefore: null,
    targetDate: todayKey,
    order: 4,
    createdAt: now - 4000,
    subtasks: [],
    durationDays: 1,
    completedDayKeys: [],
  },
  {
    id: "s6",
    title: "去药店买维生素 D + 取快递",
    completed: false,
    tagIds: ["tag-errand"],
    difficulty: 1,
    timeStart: "18:00",
    timeEnd: null,
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
  },
  {
    id: "s7",
    title: "晨跑 3 公里 + 拉伸",
    completed: true,
    tagIds: ["tag-health"],
    difficulty: 2,
    timeStart: "07:00",
    timeEnd: "07:40",
    reminderMinsBefore: null,
    targetDate: todayKey,
    order: 6,
    createdAt: now - 6000,
    subtasks: [],
    durationDays: 1,
    completedDayKeys: [],
  },
  {
    id: "s8",
    title: "整理实验室 OAE 测试数据表",
    completed: true,
    tagIds: ["tag-lab", "tag-audio"],
    difficulty: 1,
    timeStart: "11:30",
    timeEnd: "12:00",
    reminderMinsBefore: null,
    targetDate: todayKey,
    order: 7,
    createdAt: now - 7000,
    subtasks: [],
    durationDays: 1,
    completedDayKeys: [],
  },
  {
    id: "s9",
    title: "准备周五 Journal Club 的 slides",
    completed: false,
    tagIds: ["tag-paper", "tag-audio"],
    difficulty: 2,
    timeStart: "10:00",
    timeEnd: "11:30",
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
  },
  {
    id: "s10",
    title: "游泳 40 分钟 + 核心力量训练",
    completed: false,
    tagIds: ["tag-health"],
    difficulty: 2,
    timeStart: "19:00",
    timeEnd: "20:00",
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
  },
];

export const useTodoStore = create<TodoState>()(
  persist(
    (set, get) => ({
      todos: SEED_TODOS,
      archivedTodos: [],
      viewMode: "all" as ViewMode,
      filterTagIds: [],
      editingTodoId: null,

      setViewMode: (mode) => set({ viewMode: mode }),
      setEditingTodoId: (id) => set({ editingTodoId: id }),

      toggleFilterTag: (tagId) =>
        set((s) => ({
          filterTagIds: s.filterTagIds.includes(tagId)
            ? s.filterTagIds.filter((id) => id !== tagId)
            : [...s.filterTagIds, tagId],
        })),

      clearFilterTags: () => set({ filterTagIds: [] }),

      addTodo: (title, tagIds = [], targetDate = getTodayDateKey()) => {
        const todos = get().todos;
        const minOrder =
          todos.length > 0 ? Math.min(...todos.filter((t) => !t.completed).map((t) => t.order)) : 0;
        const todo: Todo = {
          id: nanoid(),
          title,
          completed: false,
          tagIds,
          difficulty: 2 as Difficulty,
          timeStart: null,
          timeEnd: null,
          reminderMinsBefore: null,
          targetDate,
          order: minOrder - 1,
          createdAt: Date.now(),
          subtasks: [],
          durationDays: 1,
          completedDayKeys: [],
        };
        set((s) => ({ todos: [todo, ...s.todos] }));
      },

      updateTodo: (id, updates) =>
        set((s) => ({ todos: s.todos.map((t) => (t.id === id ? { ...t, ...updates } : t)) })),

      toggleTodo: (id, dateKey) =>
        set((s) => ({
          todos: s.todos.map((t) => {
            if (t.id !== id) return t;
            const dur = t.durationDays ?? 1;
            if (dur > 1 && dateKey) {
              const keys = t.completedDayKeys ?? [];
              const alreadyDone = keys.includes(dateKey);
              const nextKeys = alreadyDone
                ? keys.filter((k) => k !== dateKey)
                : [...keys, dateKey];
              const allDone = nextKeys.length >= dur;
              return {
                ...t,
                completedDayKeys: nextKeys,
                completed: allDone,
                subtasks: allDone
                  ? (t.subtasks ?? []).map((st) => ({ ...st, completed: true }))
                  : (t.subtasks ?? []),
              };
            }
            const next = !t.completed;
            return {
              ...t,
              completed: next,
              subtasks: next
                ? (t.subtasks ?? []).map((st) => ({ ...st, completed: true }))
                : (t.subtasks ?? []),
            };
          }),
        })),

      deleteTodo: (id) =>
        set((s) => ({
          todos: s.todos.filter((t) => t.id !== id),
          editingTodoId: s.editingTodoId === id ? null : s.editingTodoId,
        })),

      reorderTodos: (activeId, overId, scopedIds) => {
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
          const nextOrderMap = new Map(
            reordered.map((todo, index) => [todo.id, orderSlots[index]]),
          );

          return {
            todos: s.todos.map((todo) =>
              nextOrderMap.has(todo.id) ? { ...todo, order: nextOrderMap.get(todo.id)! } : todo,
            ),
          };
        });
      },

      reorderSubtasks: (todoId, activeId, overId) => {
        set((s) => ({
          todos: s.todos.map((t) => {
            if (t.id !== todoId) return t;
            const subs = [...(t.subtasks ?? [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
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
      },

      archiveCompleted: () =>
        set((s) => {
          const done = s.todos.filter((t) => t.completed);
          const remaining = s.todos.filter((t) => !t.completed);
          return {
            todos: remaining,
            archivedTodos: [...s.archivedTodos, ...done],
          };
        }),

      archiveBoardCompleted: (boardDate) =>
        set((s) => {
          const todayK = getTodayDateKey();
          const isToday = boardDate === todayK;
          const done = s.todos.filter((t) => {
            if (!t.completed) return false;
            return isToday ? t.targetDate <= todayK : t.targetDate === boardDate;
          });
          if (done.length === 0) return s;
          const doneIds = new Set(done.map((t) => t.id));
          return {
            todos: s.todos.filter((t) => !doneIds.has(t.id)),
            archivedTodos: [...s.archivedTodos, ...done],
          };
        }),

      removeTagFromAllTodos: (tagId) =>
        set((s) => ({
          todos: s.todos.map((t) => ({ ...t, tagIds: t.tagIds.filter((id) => id !== tagId) })),
        })),

      addSubtask: (todoId, title) =>
        set((s) => ({
          todos: s.todos.map((t) => {
            if (t.id !== todoId) return t;
            const subs = t.subtasks ?? [];
            const maxOrder = subs.length > 0 ? Math.max(...subs.map((st) => st.order ?? 0)) : -1;
            return {
              ...t,
              subtasks: [...subs, { id: nanoid(), title, completed: false, order: maxOrder + 1 }],
            };
          }),
        })),

      toggleSubtask: (todoId, subtaskId) =>
        set((s) => ({
          todos: s.todos.map((t) => {
            if (t.id !== todoId) return t;
            const subs = t.subtasks ?? [];
            return {
              ...t,
              subtasks: subs.map((st) =>
                st.id === subtaskId ? { ...st, completed: !st.completed } : st,
              ),
            };
          }),
        })),

      deleteSubtask: (todoId, subtaskId) =>
        set((s) => ({
          todos: s.todos.map((t) => {
            if (t.id !== todoId) return t;
            return { ...t, subtasks: (t.subtasks ?? []).filter((st) => st.id !== subtaskId) };
          }),
        })),

      importTodos: (incoming) => {
        let count = 0;
        set((s) => {
          const existingMap = new Map(s.todos.map((t) => [t.id, t]));
          for (const t of incoming) {
            existingMap.set(t.id, {
              ...t,
              subtasks: (t.subtasks ?? []).map((st, i) => ({ ...st, order: st.order ?? i })),
              durationDays: t.durationDays ?? 1,
              completedDayKeys: t.completedDayKeys ?? [],
            });
            count++;
          }
          return { todos: Array.from(existingMap.values()) };
        });
        return count;
      },

      importArchivedTodos: (incoming) => {
        let count = 0;
        set((s) => {
          const existingMap = new Map(s.archivedTodos.map((t) => [t.id, t]));
          for (const t of incoming) {
            existingMap.set(t.id, {
              ...t,
              subtasks: (t.subtasks ?? []).map((st, i) => ({ ...st, order: st.order ?? i })),
              durationDays: t.durationDays ?? 1,
              completedDayKeys: t.completedDayKeys ?? [],
            });
            count++;
          }
          return { archivedTodos: Array.from(existingMap.values()) };
        });
        return count;
      },

      splitOverdueSubtasks: (todayKey) => {
        const yesterdayKey = shiftDateKey(todayKey, -1);
        set((s) => {
          const next: Todo[] = [];
          for (const td of s.todos) {
            if (td.targetDate !== yesterdayKey) {
              next.push(td);
              continue;
            }
            const subs = td.subtasks ?? [];
            if (subs.length === 0) {
              next.push(td);
              continue;
            }
            const done = subs.filter((st) => st.completed);
            const pending = subs.filter((st) => !st.completed);
            if (done.length > 0) {
              next.push({
                ...td,
                id: nanoid(),
                title: td.title,
                completed: true,
                subtasks: done,
                targetDate: yesterdayKey,
                completedDayKeys: td.completedDayKeys ?? [],
              });
            }
            if (pending.length > 0) {
              next.push({
                ...td,
                targetDate: todayKey,
                completed: false,
                subtasks: pending,
                completedDayKeys: td.completedDayKeys ?? [],
              });
            } else if (done.length === 0) {
              next.push({ ...td, targetDate: todayKey });
            }
          }
          return { todos: next };
        });
      },
    }),
    {
      name: "tinydo-todos",
      version: 7,
      partialize: (state) => ({ todos: state.todos, archivedTodos: state.archivedTodos }),
      migrate: (persisted, prevVersion) => {
        if (prevVersion < 6) {
          return { todos: SEED_TODOS, archivedTodos: [] };
        }
        const s = persisted as { todos?: Todo[]; archivedTodos?: Todo[] };
        const migrateTodo = (t: Todo) => ({
          ...t,
          subtasks: (t.subtasks ?? []).map((st, i) => ({ ...st, order: st.order ?? i })),
          durationDays: t.durationDays ?? 1,
          completedDayKeys: t.completedDayKeys ?? [],
        });
        const todos = (s?.todos ?? SEED_TODOS).map(migrateTodo);
        const archivedTodos = (s?.archivedTodos ?? []).map(migrateTodo);
        return { todos, archivedTodos };
      },
    },
  ),
);
