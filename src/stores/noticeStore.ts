import { create } from "zustand";

type NoticeKind = "error";

interface Notice {
  id: number;
  kind: NoticeKind;
  text: string;
}

interface NoticeState {
  notice: Notice | null;
  showError: (text: string) => void;
  clear: () => void;
}

let clearTimer: ReturnType<typeof setTimeout> | null = null;

function resetTimer(clear: () => void) {
  if (clearTimer) clearTimeout(clearTimer);
  clearTimer = setTimeout(clear, 5000);
}

export const useNoticeStore = create<NoticeState>()((set) => ({
  notice: null,
  showError: (text) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    set({
      notice: {
        id: Date.now(),
        kind: "error",
        text: trimmed,
      },
    });
    resetTimer(() => set({ notice: null }));
  },
  clear: () => {
    if (clearTimer) {
      clearTimeout(clearTimer);
      clearTimer = null;
    }
    set({ notice: null });
  },
}));
