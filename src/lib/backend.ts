import { invoke } from "@tauri-apps/api/core";
import type { Todo, Tag, TagGroup, TinyEvent, PredictionResult } from "@/types";

// ── Error parsing ──────────────────────────────────────────────────────

interface AppErrorPayload {
  code: string;
  message: string;
}

function isAppError(e: unknown): e is AppErrorPayload {
  return (
    typeof e === "object" &&
    e !== null &&
    typeof (e as AppErrorPayload).code === "string" &&
    typeof (e as AppErrorPayload).message === "string"
  );
}

export function parseError(e: unknown): string {
  if (isAppError(e)) return e.message;
  return String(e);
}

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
  eventDebounceSeconds: number;
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
  tagsCount: number;
  tagGroupsCount: number;
  settingsUpdated: boolean;
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

// ── Events ────────────────────────────────────────────────────────────

export function saveEvents(events: TinyEvent[]): Promise<void> {
  return invoke("save_events", { events });
}

export function getEventsForTodo(todoId: string): Promise<TinyEvent[]> {
  return invoke<TinyEvent[]>("get_events_for_todo", { todoId });
}

export function getEventsForDate(dayStartMs: number, dayEndMs: number): Promise<TinyEvent[]> {
  return invoke<TinyEvent[]>("get_events_for_date", { dayStartMs, dayEndMs });
}

export function getEventsInRange(fromMs: number, toMs: number): Promise<TinyEvent[]> {
  return invoke<TinyEvent[]>("get_events_in_range", { fromMs, toMs });
}

// ── Predict ───────────────────────────────────────────────────────────

export function predictCompletions(): Promise<PredictionResult[]> {
  return invoke<PredictionResult[]>("predict_completions");
}

// ── Reminders ──────────────────────────────────────────────────────────

export function rescheduleReminders(): Promise<void> {
  return invoke("reschedule_reminders");
}

export function cancelAllReminders(): Promise<void> {
  return invoke("cancel_all_reminders");
}

// ── Sync ──────────────────────────────────────────────────────────────

export interface SyncStatus {
  configured: boolean;
  serverUrl: string;
  deviceId: string;
  lastSyncVersion: number;
  lastSyncTime: number;
  deviceCount: number;
}

export interface ConflictEntry {
  entityType: string;
  entityId: string;
  localData: string;
  remoteData: string;
  localTimestamp: number;
  remoteTimestamp: number;
}

export interface SyncResult {
  pulled: number;
  pushed: number;
  conflicts: ConflictEntry[];
  newVersion: number;
}

export interface ConflictResolution {
  entityType: string;
  entityId: string;
  keep: "local" | "remote";
}

export function syncGenerateKey(): Promise<string> {
  return invoke<string>("sync_generate_key");
}

export function syncConfigure(serverUrl: string, syncKey: string): Promise<SyncStatus> {
  return invoke<SyncStatus>("sync_configure", { serverUrl, syncKey });
}

export function syncPush(): Promise<number> {
  return invoke<number>("sync_push");
}

export function syncPull(): Promise<SyncResult> {
  return invoke<SyncResult>("sync_pull");
}

export function syncFull(): Promise<SyncResult> {
  return invoke<SyncResult>("sync_full");
}

export function syncGetStatus(): Promise<SyncStatus> {
  return invoke<SyncStatus>("sync_get_status");
}

export function syncDisconnect(): Promise<void> {
  return invoke("sync_disconnect");
}

export interface LastSyncConfig {
  serverUrl: string;
  syncKey: string;
}

export function syncGetLastConfig(): Promise<LastSyncConfig> {
  return invoke<LastSyncConfig>("sync_get_last_config");
}

export function syncResolveConflict(
  resolution: ConflictResolution,
  remoteData: string,
  localData: string,
): Promise<void> {
  return invoke("sync_resolve_conflict", { resolution, remoteData, localData });
}
