import { create } from "zustand";
import * as backend from "@/lib/backend";
import { flushAllPending } from "@/stores/eventStore";
import type { PredictionResult } from "@/types";

interface PredictState {
  predictions: Map<string, PredictionResult>;
  status: "idle" | "refreshing" | "stale" | "error";
  lastUpdatedAt: number | null;
  _refreshTimer: ReturnType<typeof setTimeout> | null;
  _requestVersion: number;
  refreshPredictions: () => Promise<void>;
  scheduleRefresh: (delayMs?: number) => void;
  markStale: () => void;
  getPrediction: (todoId: string) => PredictionResult | undefined;
}

const DEBOUNCE_MS = 2000;

export const usePredictStore = create<PredictState>()((set, get) => ({
  predictions: new Map(),
  status: "idle",
  lastUpdatedAt: null,
  _refreshTimer: null,
  _requestVersion: 0,

  refreshPredictions: async () => {
    const nextVersion = get()._requestVersion + 1;
    set({ _requestVersion: nextVersion, status: "refreshing" });
    await flushAllPending();
    try {
      const results = await backend.predictCompletions();
      if (get()._requestVersion !== nextVersion) return;
      const map = new Map<string, PredictionResult>();
      for (const result of results) {
        map.set(result.todoId, result);
      }
      set({
        predictions: map,
        status: "idle",
        lastUpdatedAt: Date.now(),
      });
    } catch {
      if (get()._requestVersion !== nextVersion) return;
      set({ status: "error" });
    }
  },

  scheduleRefresh: (delayMs = DEBOUNCE_MS) => {
    const prev = get()._refreshTimer;
    if (prev) clearTimeout(prev);
    const timer = setTimeout(() => {
      void get().refreshPredictions();
    }, delayMs);
    set({ _refreshTimer: timer, status: "stale" });
  },

  markStale: () => set((s) => ({ status: s.status === "refreshing" ? s.status : "stale" })),

  getPrediction: (todoId) => {
    return get().predictions.get(todoId);
  },
}));
