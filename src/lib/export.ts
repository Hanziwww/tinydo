import { save, open } from "@tauri-apps/plugin-dialog";
import * as backend from "@/lib/backend";
import { settingsToStore } from "@/lib/init";
import { useTodoStore } from "@/stores/todoStore";
import { useTagStore } from "@/stores/tagStore";
import { useSettingsStore } from "@/stores/settingsStore";

export async function exportAllData() {
  const filePath = await save({
    defaultPath: `tinydo-export-${new Date().toISOString().slice(0, 10)}.json`,
    filters: [{ name: "JSON", extensions: ["json"] }],
  });

  if (!filePath) return;

  try {
    await backend.exportData(filePath);
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

  try {
    const result = await backend.importData(filePath);
    const total = result.todosCount + result.archivedCount;

    const [todos, archivedTodos, tags, tagGroups, settings] = await Promise.all([
      backend.getTodos(false),
      backend.getTodos(true),
      backend.getTags(),
      backend.getTagGroups(),
      backend.getAllSettings(),
    ]);
    useTodoStore.getState()._hydrate(todos, archivedTodos);
    useTagStore.getState()._hydrate(tags, tagGroups);
    useSettingsStore.getState()._hydrate(settingsToStore(settings));

    return total;
  } catch (err) {
    console.error("Import failed:", err);
    throw err;
  }
}
