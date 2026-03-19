import { create } from "zustand";
import { nanoid } from "nanoid";
import type { TinyEvent, EventType } from "@/types";
import * as backend from "@/lib/backend";
import { useSettingsStore } from "@/stores/settingsStore";
import { showErrorNotice } from "@/lib/errorNotice";

const IMMEDIATE_EVENTS: Set<EventType> = new Set([
  "created",
  "deleted",
  "archived",
  "completed",
  "uncompleted",
  "duplicated",
]);

interface PendingEntry {
  event: TinyEvent;
  timer: ReturnType<typeof setTimeout>;
}

function pendingKey(todoId: string, eventType: EventType, field: string | null): string {
  return `${todoId}::${eventType}::${field ?? ""}`;
}

interface EventState {
  eventViewTodoId: string | null;
  setEventViewTodoId: (id: string | null) => void;
}

const pendingMap = new Map<string, PendingEntry>();
const inFlightSaves = new Set<Promise<void>>();

function getDebounceMs(): number {
  return useSettingsStore.getState().eventDebounceSeconds * 1000;
}

function trackSave(promise: Promise<void>) {
  inFlightSaves.add(promise);
  void promise.finally(() => inFlightSaves.delete(promise));
  return promise;
}

function persistEvents(events: TinyEvent[]) {
  return trackSave(
    backend.saveEvents(events).catch((e: unknown) => {
      showErrorNotice(e);
    }),
  );
}

function flushEntry(key: string) {
  const entry = pendingMap.get(key);
  if (!entry) return;
  pendingMap.delete(key);
  void persistEvents([entry.event]);
}

export async function flushAllPending() {
  const flushed: Promise<void>[] = [];
  for (const [key, entry] of pendingMap) {
    clearTimeout(entry.timer);
    pendingMap.delete(key);
    flushed.push(persistEvents([entry.event]));
  }
  if (flushed.length > 0) {
    await Promise.all(flushed);
  }
  if (inFlightSaves.size > 0) {
    await Promise.all(Array.from(inFlightSaves));
  }
}

export function recordEvent(
  todoId: string,
  eventType: EventType,
  field?: string | null,
  oldValue?: unknown,
  newValue?: unknown,
) {
  const event: TinyEvent = {
    id: nanoid(),
    todoId,
    eventType,
    field: field ?? null,
    oldValue: oldValue ?? null,
    newValue: newValue ?? null,
    timestamp: Date.now(),
  };

  if (IMMEDIATE_EVENTS.has(eventType)) {
    void persistEvents([event]);
    return;
  }

  const key = pendingKey(todoId, eventType, field ?? null);
  const existing = pendingMap.get(key);

  if (existing) {
    clearTimeout(existing.timer);
    existing.event.newValue = newValue ?? null;
    existing.event.timestamp = Date.now();
    existing.timer = setTimeout(() => flushEntry(key), getDebounceMs());
  } else {
    const timer = setTimeout(() => flushEntry(key), getDebounceMs());
    pendingMap.set(key, { event, timer });
  }
}

export const useEventStore = create<EventState>()((set) => ({
  eventViewTodoId: null,
  setEventViewTodoId: (id) => set({ eventViewTodoId: id }),
}));
