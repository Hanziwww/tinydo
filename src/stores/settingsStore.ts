import { create } from "zustand";
import type { Theme, Locale } from "@/types";
import * as backend from "@/lib/backend";
import { storeToSettings } from "@/lib/init";

interface WindowRect {
  w: number;
  h: number;
  x: number;
  y: number;
}

interface WindowPos {
  x: number;
  y: number;
}

interface SettingsState {
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
  fullModeRect: WindowRect | null;
  miniModePosition: WindowPos | null;
  _hydrated: boolean;
  _hydrate: (data: Omit<SettingsState, "_hydrated" | "_hydrate" | keyof SettingsActions>) => void;
  setTheme: (theme: Theme) => void;
  setLocale: (locale: Locale) => void;
  toggleTimeline: () => void;
  setTomorrowPlanningUnlockHour: (hour: number) => void;
  setTimelineRange: (start: number, end: number) => void;
  setUserName: (name: string) => void;
  setMiniAlwaysOnTop: (v: boolean) => void;
  setMiniFadeOnBlur: (v: boolean) => void;
  setMiniFadeOpacity: (v: number) => void;
  setEnableSubtasks: (v: boolean) => void;
  setMaxDurationDays: (v: number) => void;
  setFullModeRect: (rect: WindowRect | null) => void;
  setMiniModePosition: (pos: WindowPos | null) => void;
}

type SettingsActions = {
  setTheme: (theme: Theme) => void;
  setLocale: (locale: Locale) => void;
  toggleTimeline: () => void;
  setTomorrowPlanningUnlockHour: (hour: number) => void;
  setTimelineRange: (start: number, end: number) => void;
  setUserName: (name: string) => void;
  setMiniAlwaysOnTop: (v: boolean) => void;
  setMiniFadeOnBlur: (v: boolean) => void;
  setMiniFadeOpacity: (v: number) => void;
  setEnableSubtasks: (v: boolean) => void;
  setMaxDurationDays: (v: number) => void;
  setFullModeRect: (rect: WindowRect | null) => void;
  setMiniModePosition: (pos: WindowPos | null) => void;
};

function applyTheme(theme: Theme) {
  if (typeof document !== "undefined") {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }
}

function persistSettings() {
  const s = useSettingsStore.getState();
  backend.saveSettings(storeToSettings(s)).catch((e: unknown) => {
    console.error("Failed to persist settings:", e);
  });
}

export const useSettingsStore = create<SettingsState>()((set) => ({
  theme: "dark",
  locale: "zh",
  showTimeline: true,
  tomorrowPlanningUnlockHour: 20,
  timelineStartHour: 0,
  timelineEndHour: 24,
  userName: "",
  miniAlwaysOnTop: true,
  miniFadeOnBlur: true,
  miniFadeOpacity: 0.45,
  enableSubtasks: true,
  maxDurationDays: 5,
  fullModeRect: null,
  miniModePosition: null,
  _hydrated: false,

  _hydrate: (data) => {
    applyTheme(data.theme);
    set({ ...data, _hydrated: true });
  },

  setTheme: (theme) => {
    applyTheme(theme);
    set({ theme });
    persistSettings();
  },
  setLocale: (locale) => {
    set({ locale });
    persistSettings();
  },
  toggleTimeline: () => {
    set((s) => ({ showTimeline: !s.showTimeline }));
    persistSettings();
  },
  setTomorrowPlanningUnlockHour: (hour) => {
    set({ tomorrowPlanningUnlockHour: Math.min(23, Math.max(0, Math.round(hour))) });
    persistSettings();
  },
  setTimelineRange: (start, end) => {
    set({
      timelineStartHour: Math.max(0, Math.min(23, start)),
      timelineEndHour: Math.max(1, Math.min(24, end)),
    });
    persistSettings();
  },
  setUserName: (name) => {
    set({ userName: name });
    persistSettings();
  },
  setMiniAlwaysOnTop: (v) => {
    set({ miniAlwaysOnTop: v });
    persistSettings();
  },
  setMiniFadeOnBlur: (v) => {
    set({ miniFadeOnBlur: v });
    persistSettings();
  },
  setMiniFadeOpacity: (v) => {
    set({ miniFadeOpacity: Math.max(0.1, Math.min(1, v)) });
    persistSettings();
  },
  setEnableSubtasks: (v) => {
    set({ enableSubtasks: v });
    persistSettings();
  },
  setMaxDurationDays: (v) => {
    set({ maxDurationDays: Math.max(1, Math.min(7, Math.round(v))) });
    persistSettings();
  },
  setFullModeRect: (rect) => {
    set({ fullModeRect: rect });
    persistSettings();
  },
  setMiniModePosition: (pos) => {
    set({ miniModePosition: pos });
    persistSettings();
  },
}));
