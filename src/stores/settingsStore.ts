import { create } from "zustand";
import type { Theme, Locale } from "@/types";
import * as backend from "@/lib/backend";
import { showErrorNotice } from "@/lib/errorNotice";
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
  return backend.saveSettings(storeToSettings(s));
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
    void persistSettings().catch((error: unknown) => showErrorNotice(error));
  },
  setLocale: (locale) => {
    set({ locale });
    void persistSettings().catch((error: unknown) => showErrorNotice(error));
  },
  toggleTimeline: () => {
    set((s) => ({ showTimeline: !s.showTimeline }));
    void persistSettings().catch((error: unknown) => showErrorNotice(error));
  },
  setTomorrowPlanningUnlockHour: (hour) => {
    set({ tomorrowPlanningUnlockHour: Math.min(23, Math.max(0, Math.round(hour))) });
    void persistSettings().catch((error: unknown) => showErrorNotice(error));
  },
  setTimelineRange: (start, end) => {
    set({
      timelineStartHour: Math.max(0, Math.min(23, start)),
      timelineEndHour: Math.max(1, Math.min(24, end)),
    });
    void persistSettings().catch((error: unknown) => showErrorNotice(error));
  },
  setUserName: (name) => {
    set({ userName: name });
    void persistSettings().catch((error: unknown) => showErrorNotice(error));
  },
  setMiniAlwaysOnTop: (v) => {
    set({ miniAlwaysOnTop: v });
    void persistSettings().catch((error: unknown) => showErrorNotice(error));
  },
  setMiniFadeOnBlur: (v) => {
    set({ miniFadeOnBlur: v });
    void persistSettings().catch((error: unknown) => showErrorNotice(error));
  },
  setMiniFadeOpacity: (v) => {
    set({ miniFadeOpacity: Math.max(0.1, Math.min(1, v)) });
    void persistSettings().catch((error: unknown) => showErrorNotice(error));
  },
  setEnableSubtasks: (v) => {
    set({ enableSubtasks: v });
    void persistSettings().catch((error: unknown) => showErrorNotice(error));
  },
  setMaxDurationDays: (v) => {
    set({ maxDurationDays: Math.max(1, Math.min(7, Math.round(v))) });
    void persistSettings().catch((error: unknown) => showErrorNotice(error));
  },
  setFullModeRect: (rect) => {
    set({ fullModeRect: rect });
    void persistSettings().catch((error: unknown) => showErrorNotice(error));
  },
  setMiniModePosition: (pos) => {
    set({ miniModePosition: pos });
    void persistSettings().catch((error: unknown) => showErrorNotice(error));
  },
}));
