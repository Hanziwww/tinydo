import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Theme, Locale } from "@/types";

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

function applyTheme(theme: Theme) {
  if (typeof document !== "undefined") {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
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

      setTheme: (theme) => {
        applyTheme(theme);
        set({ theme });
      },
      setLocale: (locale) => set({ locale }),
      toggleTimeline: () => set((s) => ({ showTimeline: !s.showTimeline })),
      setTomorrowPlanningUnlockHour: (hour) =>
        set({ tomorrowPlanningUnlockHour: Math.min(23, Math.max(0, Math.round(hour))) }),
      setTimelineRange: (start, end) =>
        set({
          timelineStartHour: Math.max(0, Math.min(23, start)),
          timelineEndHour: Math.max(1, Math.min(24, end)),
        }),
      setUserName: (name) => set({ userName: name }),
      setMiniAlwaysOnTop: (v) => set({ miniAlwaysOnTop: v }),
      setMiniFadeOnBlur: (v) => set({ miniFadeOnBlur: v }),
      setMiniFadeOpacity: (v) => set({ miniFadeOpacity: Math.max(0.1, Math.min(1, v)) }),
      setEnableSubtasks: (v) => set({ enableSubtasks: v }),
      setMaxDurationDays: (v) => set({ maxDurationDays: Math.max(1, Math.min(7, Math.round(v))) }),
      setFullModeRect: (rect) => set({ fullModeRect: rect }),
      setMiniModePosition: (pos) => set({ miniModePosition: pos }),
    }),
    {
      name: "tinydo-settings",
      version: 7,
      migrate: (persistedState) => {
        const s = (persistedState ?? {}) as Record<string, unknown>;
        return {
          theme: (s.theme as Theme) ?? "dark",
          locale: (s.locale as Locale) ?? "zh",
          showTimeline: (s.showTimeline as boolean) ?? true,
          tomorrowPlanningUnlockHour: (s.tomorrowPlanningUnlockHour as number) ?? 20,
          timelineStartHour: (s.timelineStartHour as number) ?? 0,
          timelineEndHour: (s.timelineEndHour as number) ?? 24,
          userName: (s.userName as string) ?? "",
          miniAlwaysOnTop: (s.miniAlwaysOnTop as boolean) ?? true,
          miniFadeOnBlur: (s.miniFadeOnBlur as boolean) ?? true,
          miniFadeOpacity: (s.miniFadeOpacity as number) ?? 0.45,
          enableSubtasks: (s.enableSubtasks as boolean) ?? true,
          maxDurationDays: (s.maxDurationDays as number) ?? 5,
          fullModeRect: (s.fullModeRect as { w: number; h: number; x: number; y: number }) ?? null,
          miniModePosition: (s.miniModePosition as { x: number; y: number }) ?? null,
        };
      },
      onRehydrateStorage: () => (state) => {
        if (state) applyTheme(state.theme);
      },
    },
  ),
);
