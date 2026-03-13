import { save, open } from "@tauri-apps/plugin-dialog";
import { writeTextFile, readTextFile } from "@tauri-apps/plugin-fs";
import { useTodoStore } from "@/stores/todoStore";
import { useTagStore } from "@/stores/tagStore";
import { useSettingsStore } from "@/stores/settingsStore";
import type { Todo } from "@/types";

export async function exportAllData() {
  const { todos } = useTodoStore.getState();
  const { tags, tagGroups } = useTagStore.getState();
  const { theme, locale, showTimeline, tomorrowPlanningUnlockHour } = useSettingsStore.getState();

  const data = {
    version: "1.0",
    exportedAt: new Date().toISOString(),
    todos,
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

  const incoming: Todo[] = data.todos.map((t: Record<string, unknown>) => ({
    id: t.id ?? crypto.randomUUID(),
    title: t.title ?? "",
    completed: !!t.completed,
    tagIds: Array.isArray(t.tagIds) ? t.tagIds : [],
    difficulty: t.difficulty ?? 2,
    timeStart: t.timeStart ?? null,
    timeEnd: t.timeEnd ?? null,
    reminderMinsBefore: t.reminderMinsBefore ?? null,
    targetDate: t.targetDate ?? new Date().toISOString().slice(0, 10).replace(/-/g, ""),
    order: typeof t.order === "number" ? t.order : 0,
    createdAt: typeof t.createdAt === "number" ? t.createdAt : Date.now(),
    subtasks: Array.isArray(t.subtasks) ? t.subtasks : [],
    durationDays: typeof t.durationDays === "number" ? t.durationDays : 1,
  }));

  return useTodoStore.getState().importTodos(incoming);
}
