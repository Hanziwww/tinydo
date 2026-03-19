import { save, open } from "@tauri-apps/plugin-dialog";
import * as backend from "@/lib/backend";
import { settingsToStore } from "@/lib/init";
import { useTodoStore } from "@/stores/todoStore";
import { useTagStore } from "@/stores/tagStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { usePredictStore } from "@/stores/predictStore";

async function reloadImportedState() {
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
}

export async function exportAllData(): Promise<string | null> {
  const filePath = await save({
    defaultPath: `tinydo-export-${new Date().toISOString().slice(0, 10)}.json`,
    filters: [{ name: "JSON", extensions: ["json"] }],
  });

  if (!filePath) return null;

  await backend.exportData(filePath);
  return filePath;
}

export async function importAllData(): Promise<backend.ImportResult | null> {
  const filePath = await open({
    filters: [{ name: "JSON", extensions: ["json"] }],
    multiple: false,
  });

  if (!filePath) return null;

  const result = await backend.importData(filePath);
  try {
    await reloadImportedState();
  } catch {
    await reloadImportedState();
  }
  await usePredictStore.getState().refreshPredictions();

  return result;
}
