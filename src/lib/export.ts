import { save, open } from "@tauri-apps/plugin-dialog";
import { writeTextFile, readTextFile } from "@tauri-apps/plugin-fs";
import { useTodoStore } from "@/stores/todoStore";
import { useTagStore } from "@/stores/tagStore";
import { useSettingsStore } from "@/stores/settingsStore";
import type { Todo } from "@/types";

function normalizeTodo(t: Record<string, unknown>): Todo {
  return {
    id: (t.id as string) ?? crypto.randomUUID(),
    title: (t.title as string) ?? "",
    completed: !!t.completed,
    tagIds: Array.isArray(t.tagIds) ? t.tagIds : [],
    difficulty: (t.difficulty as number) ?? 2,
    timeStart: (t.timeStart as string) ?? null,
    timeEnd: (t.timeEnd as string) ?? null,
    reminderMinsBefore: (t.reminderMinsBefore as number) ?? null,
    targetDate:
      (t.targetDate as string) ?? new Date().toISOString().slice(0, 10).replace(/-/g, ""),
    order: typeof t.order === "number" ? t.order : 0,
    createdAt: typeof t.createdAt === "number" ? t.createdAt : Date.now(),
    subtasks: Array.isArray(t.subtasks)
      ? (t.subtasks as Record<string, unknown>[]).map((st, i) => ({
          id: (st.id as string) ?? crypto.randomUUID(),
          title: (st.title as string) ?? "",
          completed: !!st.completed,
          order: typeof st.order === "number" ? st.order : i,
        }))
      : [],
    durationDays: typeof t.durationDays === "number" ? t.durationDays : 1,
    completedDayKeys: Array.isArray(t.completedDayKeys) ? (t.completedDayKeys as string[]) : [],
  } as Todo;
}

export async function exportAllData() {
  const { todos, archivedTodos } = useTodoStore.getState();
  const { tags, tagGroups } = useTagStore.getState();
  const { theme, locale, showTimeline, tomorrowPlanningUnlockHour } = useSettingsStore.getState();

  const data = {
    version: "2.0",
    exportedAt: new Date().toISOString(),
    todos,
    archivedTodos,
    tags,
    tagGroups,
    settings: {
      theme,
      locale,
      showTimeline,
      tomorrowPlanningUnlockHour,
    },
  };

  const json = JSON.stringify(data, null, 2);
  const defaultName = `tinydo-export-${new Date().toISOString().slice(0, 10)}.json`;

  const filePath = await save({
    defaultPath: defaultName,
    filters: [{ name: "JSON", extensions: ["json"] }],
  });

  if (!filePath) return;

  try {
    await writeTextFile(filePath, json);
  } catch (err) {
    console.error("Export failed:", err);
    throw err;
  }
}

export async function importAllData(): Promise<number> {
  const filePath = await open({
    filters: [{ name: "JSON", extensions: ["json"] }],
    multiple: false,
  });

  if (!filePath) return 0;

  const raw = await readTextFile(filePath as string);
  const data = JSON.parse(raw);

  if (!data || !Array.isArray(data.todos)) {
    throw new Error("Invalid format: missing todos array");
  }

  const incoming: Todo[] = data.todos.map((t: Record<string, unknown>) => normalizeTodo(t));
  let count = useTodoStore.getState().importTodos(incoming);

  if (Array.isArray(data.archivedTodos)) {
    const archivedIncoming: Todo[] = data.archivedTodos.map((t: Record<string, unknown>) =>
      normalizeTodo(t),
    );
    count += useTodoStore.getState().importArchivedTodos(archivedIncoming);
  }

  return count;
}
