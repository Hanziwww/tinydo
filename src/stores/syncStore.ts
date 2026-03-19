import { create } from "zustand";
import * as backend from "@/lib/backend";
import type { ConflictEntry, SyncResult } from "@/lib/backend";
import { initBackendData, settingsToStore } from "@/lib/init";
import { flushAllPending } from "@/stores/eventStore";
import { usePredictStore } from "@/stores/predictStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useTagStore } from "@/stores/tagStore";
import { useTodoStore } from "@/stores/todoStore";

type SyncState = "idle" | "syncing" | "done" | "error";

interface SyncStoreState {
  configured: boolean;
  serverUrl: string;
  syncKey: string;
  deviceId: string;
  lastSyncTime: number;
  lastSyncVersion: number;
  deviceCount: number;
  syncState: SyncState;
  syncError: string | null;
  conflicts: ConflictEntry[];
  showConflictDialog: boolean;
  prevServerUrl: string;
  prevSyncKey: string;

  hydrate: () => Promise<void>;
  configure: (serverUrl: string, syncKey: string) => Promise<void>;
  disconnect: () => Promise<void>;
  generateKey: () => Promise<string>;
  triggerSync: () => Promise<SyncResult | null>;
  resolveConflict: (conflict: ConflictEntry, keep: "local" | "remote") => Promise<void>;
  dismissConflicts: () => void;
}

async function rehydrateStoresFromBackend() {
  const data = await initBackendData();
  useTodoStore.getState()._hydrate(data.todos, data.archivedTodos);
  useTagStore.getState()._hydrate(data.tags, data.tagGroups);
  useSettingsStore.getState()._hydrate(settingsToStore(data.settings));
  await usePredictStore.getState().refreshPredictions();
}

export const useSyncStore = create<SyncStoreState>()((set, get) => ({
  configured: false,
  serverUrl: "",
  syncKey: "",
  deviceId: "",
  lastSyncTime: 0,
  lastSyncVersion: 0,
  deviceCount: 0,
  syncState: "idle",
  syncError: null,
  conflicts: [],
  showConflictDialog: false,
  prevServerUrl: "",
  prevSyncKey: "",

  hydrate: async () => {
    try {
      const status = await backend.syncGetStatus();
      set({
        configured: status.configured,
        serverUrl: status.serverUrl,
        deviceId: status.deviceId,
        lastSyncVersion: status.lastSyncVersion,
        lastSyncTime: status.lastSyncTime,
        deviceCount: status.deviceCount,
      });

      if (!status.configured) {
        const last = await backend.syncGetLastConfig();
        set({
          prevServerUrl: last.serverUrl,
          prevSyncKey: last.syncKey,
        });
      }
    } catch {
      // Not configured yet
    }
  },

  configure: async (serverUrl: string, syncKey: string) => {
    const status = await backend.syncConfigure(serverUrl, syncKey);
    set({
      configured: status.configured,
      serverUrl: status.serverUrl,
      syncKey,
      deviceId: status.deviceId,
      lastSyncVersion: status.lastSyncVersion,
      lastSyncTime: status.lastSyncTime,
      deviceCount: status.deviceCount,
      syncError: null,
    });
  },

  disconnect: async () => {
    const { serverUrl, syncKey } = get();
    await backend.syncDisconnect();
    set({
      configured: false,
      serverUrl: "",
      syncKey: "",
      deviceId: "",
      lastSyncTime: 0,
      lastSyncVersion: 0,
      deviceCount: 0,
      syncState: "idle",
      syncError: null,
      conflicts: [],
      showConflictDialog: false,
      prevServerUrl: serverUrl,
      prevSyncKey: syncKey,
    });
  },

  generateKey: async () => {
    return backend.syncGenerateKey();
  },

  triggerSync: async () => {
    if (get().syncState === "syncing" || !get().configured) return null;

    set({ syncState: "syncing", syncError: null });
    try {
      await flushAllPending();
      const result = await backend.syncFull();
      await rehydrateStoresFromBackend();
      set({
        syncState: "done",
        lastSyncVersion: result.newVersion,
        lastSyncTime: Math.floor(Date.now() / 1000),
      });

      if (result.conflicts.length > 0) {
        set({
          conflicts: result.conflicts,
          showConflictDialog: true,
        });
      }

      setTimeout(() => {
        if (get().syncState === "done") set({ syncState: "idle" });
      }, 3000);

      return result;
    } catch (e) {
      const msg =
        typeof e === "object" && e !== null && "message" in e
          ? (e as { message: string }).message
          : String(e);
      set({ syncState: "error", syncError: msg });
      return null;
    }
  },

  resolveConflict: async (conflict: ConflictEntry, keep: "local" | "remote") => {
    await backend.syncResolveConflict(
      {
        entityType: conflict.entityType,
        entityId: conflict.entityId,
        localAction: conflict.localAction,
        remoteAction: conflict.remoteAction,
        keep,
      },
      conflict.remoteData,
      conflict.localData,
    );
    await rehydrateStoresFromBackend();

    const remaining = get().conflicts.filter(
      (c) => !(c.entityType === conflict.entityType && c.entityId === conflict.entityId),
    );
    set({
      conflicts: remaining,
      showConflictDialog: remaining.length > 0,
    });
  },

  dismissConflicts: () => {
    set({ showConflictDialog: false });
  },
}));
