import { invoke } from "@tauri-apps/api/core";
import type { Todo, Tag, TagGroup } from "@/types";

// ── Settings type (matches Rust Settings struct) ───────────────────────

export interface BackendSettings {
  theme: string;
  locale: string;
  showTimeline: boolean;
  tomorrowPlanningUnlockHour: number;
  timelineStartHour: number;
  timelineEndHour: number;
  userName: string;
  miniAlwaysOnTop: boolean;
  miniFadeOnBlur: boolean;
  miniFadeOpacity: number;
  enableSubtasks: boolean;
  maxDurationDays: number;
  fullModeRect: { w: number; h: number; x: number; y: number } | null;
  miniModePosition: { x: number; y: number } | null;
}

export interface LegacyData {
  todos: Todo[];
  archivedTodos: Todo[];
  tags: Tag[];
  tagGroups: TagGroup[];
  settings: BackendSettings;
}

export interface ImportResult {
  todosCount: number;
  archivedCount: number;
}

// ── Todos ──────────────────────────────────────────────────────────────

export function getTodos(archived: boolean): Promise<Todo[]> {
  return invoke<Todo[]>("get_todos", { archived });
}

export function saveTodo(todo: Todo, archived: boolean = false): Promise<void> {
  return invoke("save_todo", { todo, archived });
}

export function saveTodos(todos: Todo[], archived: boolean = false): Promise<void> {
  return invoke("save_todos", { todos, archived });
}

export function deleteTodo(id: string): Promise<void> {
  return invoke("delete_todo", { id });
}

export function archiveTodos(ids: string[]): Promise<void> {
  return invoke("archive_todos", { ids });
}

// ── Tags ───────────────────────────────────────────────────────────────

export function getTags(): Promise<Tag[]> {
  return invoke<Tag[]>("get_tags");
}

export function saveTag(tag: Tag): Promise<void> {
  return invoke("save_tag", { tag });
}

export function deleteTag(id: string): Promise<void> {
  return invoke("delete_tag", { id });
}

export function getTagGroups(): Promise<TagGroup[]> {
  return invoke<TagGroup[]>("get_tag_groups");
}

export function saveTagGroup(group: TagGroup): Promise<void> {
  return invoke("save_tag_group", { group });
}

export function deleteTagGroup(id: string): Promise<void> {
  return invoke("delete_tag_group", { id });
}

// ── Settings ───────────────────────────────────────────────────────────

export function getAllSettings(): Promise<BackendSettings> {
  return invoke<BackendSettings>("get_all_settings");
}

export function saveSettings(settings: BackendSettings): Promise<void> {
  return invoke("save_settings", { settings });
}

// ── Migration ──────────────────────────────────────────────────────────

export function checkNeedsMigration(): Promise<boolean> {
  return invoke<boolean>("check_needs_migration");
}

export function migrateFromLegacy(data: LegacyData): Promise<void> {
  return invoke("migrate_from_legacy", { data });
}

// ── Export / Import ────────────────────────────────────────────────────

export function exportData(filePath: string): Promise<void> {
  return invoke("export_data", { filePath });
}

export function importData(filePath: string): Promise<ImportResult> {
  return invoke<ImportResult>("import_data", { filePath });
}

export function savePoster(filePath: string, pngBase64: string, dpi: number): Promise<void> {
  return invoke("save_poster", { filePath, pngBase64, dpi });
}

// ── Reminders ──────────────────────────────────────────────────────────

export function rescheduleReminders(): Promise<void> {
  return invoke("reschedule_reminders");
}

export function cancelAllReminders(): Promise<void> {
  return invoke("cancel_all_reminders");
}
