import { create } from "zustand";

export type NoticeKind = "error" | "success" | "info";

export interface NoticeAction {
  label: string;
  onAction: () => void;
}

export interface Notice {
  id: number;
  kind: NoticeKind;
  text: string;
  durationMs: number;
  action: NoticeAction | null;
}

interface ShowNoticeOptions {
  durationMs?: number;
  action?: NoticeAction | null;
}

interface NoticeState {
  notice: Notice | null;
  show: (kind: NoticeKind, text: string, options?: ShowNoticeOptions) => void;
  showError: (text: string, options?: ShowNoticeOptions) => void;
  showSuccess: (text: string, options?: ShowNoticeOptions) => void;
  showInfo: (text: string, options?: ShowNoticeOptions) => void;
  triggerAction: () => void;
  clear: () => void;
}

let clearTimer: ReturnType<typeof setTimeout> | null = null;

function clearExistingTimer() {
  if (!clearTimer) return;
  clearTimeout(clearTimer);
  clearTimer = null;
}

function resetTimer(clear: () => void, durationMs: number) {
  clearExistingTimer();
  clearTimer = setTimeout(clear, durationMs);
}

export const useNoticeStore = create<NoticeState>()((set, get) => ({
  notice: null,

  show: (kind, text, options) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const durationMs = options?.durationMs ?? 5000;
    set({
      notice: {
        id: Date.now(),
        kind,
        text: trimmed,
        durationMs,
        action: options?.action ?? null,
      },
    });
    resetTimer(() => set({ notice: null }), durationMs);
  },

  showError: (text, options) => get().show("error", text, options),
  showSuccess: (text, options) => get().show("success", text, options),
  showInfo: (text, options) => get().show("info", text, options),

  triggerAction: () => {
    const notice = get().notice;
    if (!notice?.action) return;
    const action = notice.action.onAction;
    get().clear();
    action();
  },

  clear: () => {
    clearExistingTimer();
    set({ notice: null });
  },
}));
