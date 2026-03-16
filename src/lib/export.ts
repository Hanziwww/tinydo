import { save, open } from "@tauri-apps/plugin-dialog";
import * as backend from "@/lib/backend";
import { useTodoStore } from "@/stores/todoStore";

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

    // Reload data into stores from backend
    const [todos, archivedTodos] = await Promise.all([
      backend.getTodos(false),
      backend.getTodos(true),
    ]);
    useTodoStore.getState()._hydrate(todos, archivedTodos);

    return total;
  } catch (err) {
    console.error("Import failed:", err);
    throw err;
  }
}
