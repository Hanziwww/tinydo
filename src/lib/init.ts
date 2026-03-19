import * as backend from "./backend";
import type { BackendSettings } from "./backend";
import { withTodoDefaults } from "./todo-helpers";
import type { Todo, Tag, TagGroup, Theme, Locale } from "@/types";

const LS_TODO_KEY = "tinydo-todos";
const LS_SETTINGS_KEY = "tinydo-settings";
const LS_TAGS_KEY = "tinydo-tags";

interface LegacyTodoStore {
  state: {
    todos?: Todo[];
    archivedTodos?: Todo[];
  };
  version: number;
}

interface LegacySettingsStore {
  state: Record<string, unknown>;
  version: number;
}

interface LegacyTagStore {
  state: {
    tags: Tag[];
    tagGroups: TagGroup[];
  };
  version: number;
}

function readLocalStorageJson(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

/**
 * Initialize backend data. Handles localStorage migration on first run.
 * Returns the loaded data for store hydration.
 */
export async function initBackendData(): Promise<{
  todos: Todo[];
  archivedTodos: Todo[];
  tags: Tag[];
  tagGroups: TagGroup[];
  settings: BackendSettings;
}> {
  const needsMigration = await backend.checkNeedsMigration();

  if (needsMigration) {
    const migrated = await tryMigrateFromLocalStorage();
    if (migrated) {
      return migrated;
    }
  }

  const [todos, archivedTodos, tags, tagGroups, settings] = await Promise.all([
    backend.getTodos(false),
    backend.getTodos(true),
    backend.getTags(),
    backend.getTagGroups(),
    backend.getAllSettings(),
  ]);

  return {
    todos: todos.map(withTodoDefaults),
    archivedTodos: archivedTodos.map(withTodoDefaults),
    tags,
    tagGroups,
    settings,
  };
}

function asString(v: unknown, fallback: string): string {
  return typeof v === "string" ? v : fallback;
}
function asBool(v: unknown, fallback: boolean): boolean {
  return typeof v === "boolean" ? v : fallback;
}
function asNum(v: unknown, fallback: number): number {
  return typeof v === "number" ? v : fallback;
}

async function tryMigrateFromLocalStorage(): Promise<{
  todos: Todo[];
  archivedTodos: Todo[];
  tags: Tag[];
  tagGroups: TagGroup[];
  settings: BackendSettings;
} | null> {
  const raw = readLocalStorageJson(LS_TODO_KEY);
  const todoData = raw as LegacyTodoStore | null;
  if (!todoData?.state.todos) return null;

  const settingsRaw = readLocalStorageJson(LS_SETTINGS_KEY);
  const settingsData = settingsRaw as LegacySettingsStore | null;
  const tagRaw = readLocalStorageJson(LS_TAGS_KEY);
  const tagData = tagRaw as LegacyTagStore | null;

  const todos: Todo[] = (todoData.state.todos ?? []).map(withTodoDefaults);
  const archivedTodos: Todo[] = (todoData.state.archivedTodos ?? []).map(withTodoDefaults);
  const tags: Tag[] = tagData?.state ? tagData.state.tags : [];
  const tagGroups: TagGroup[] = tagData?.state ? tagData.state.tagGroups : [];

  const s: Record<string, unknown> = settingsData?.state ? settingsData.state : {};
  const settings: BackendSettings = {
    theme: asString(s.theme, "dark"),
    locale: asString(s.locale, "zh"),
    showTimeline: asBool(s.showTimeline, true),
    tomorrowPlanningUnlockHour: asNum(s.tomorrowPlanningUnlockHour, 20),
    timelineStartHour: asNum(s.timelineStartHour, 0),
    timelineEndHour: asNum(s.timelineEndHour, 24),
    userName: asString(s.userName, ""),
    miniAlwaysOnTop: asBool(s.miniAlwaysOnTop, true),
    miniFadeOnBlur: asBool(s.miniFadeOnBlur, true),
    miniFadeOpacity: asNum(s.miniFadeOpacity, 0.45),
    enableSubtasks: asBool(s.enableSubtasks, true),
    maxDurationDays: asNum(s.maxDurationDays, 5),
    fullModeRect: (s.fullModeRect as BackendSettings["fullModeRect"]) ?? null,
    miniModePosition: (s.miniModePosition as BackendSettings["miniModePosition"]) ?? null,
    eventDebounceSeconds: asNum(s.eventDebounceSeconds, 10),
  };
  await backend.migrateFromLegacy({
    todos,
    archivedTodos,
    tags,
    tagGroups,
    settings,
  });

  console.log(
    `[TinyDo] Migrated from localStorage: ${todos.length} todos, ${archivedTodos.length} archived, ${tags.length} tags`,
  );

  localStorage.removeItem(LS_TODO_KEY);
  localStorage.removeItem(LS_SETTINGS_KEY);
  localStorage.removeItem(LS_TAGS_KEY);

  return { todos, archivedTodos, tags, tagGroups, settings };
}

/**
 * Convert BackendSettings to store-compatible values.
 */
export function settingsToStore(s: BackendSettings) {
  return {
    theme: s.theme as Theme,
    locale: s.locale as Locale,
    showTimeline: s.showTimeline,
    tomorrowPlanningUnlockHour: s.tomorrowPlanningUnlockHour,
    timelineStartHour: s.timelineStartHour,
    timelineEndHour: s.timelineEndHour,
    userName: s.userName,
    miniAlwaysOnTop: s.miniAlwaysOnTop,
    miniFadeOnBlur: s.miniFadeOnBlur,
    miniFadeOpacity: s.miniFadeOpacity,
    enableSubtasks: s.enableSubtasks,
    maxDurationDays: s.maxDurationDays,
    fullModeRect: s.fullModeRect,
    miniModePosition: s.miniModePosition,
    eventDebounceSeconds: s.eventDebounceSeconds,
  };
}

/**
 * Convert current store state to BackendSettings for saving.
 */
export function storeToSettings(state: {
  theme: Theme;
  locale: Locale;
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
}): BackendSettings {
  return {
    theme: state.theme,
    locale: state.locale,
    showTimeline: state.showTimeline,
    tomorrowPlanningUnlockHour: state.tomorrowPlanningUnlockHour,
    timelineStartHour: state.timelineStartHour,
    timelineEndHour: state.timelineEndHour,
    userName: state.userName,
    miniAlwaysOnTop: state.miniAlwaysOnTop,
    miniFadeOnBlur: state.miniFadeOnBlur,
    miniFadeOpacity: state.miniFadeOpacity,
    enableSubtasks: state.enableSubtasks,
    maxDurationDays: state.maxDurationDays,
    fullModeRect: state.fullModeRect,
    miniModePosition: state.miniModePosition,
    eventDebounceSeconds: state.eventDebounceSeconds,
  };
}
