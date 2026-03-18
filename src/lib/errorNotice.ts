import { parseError } from "@/lib/backend";
import { useNoticeStore } from "@/stores/noticeStore";

export function showErrorNotice(error: unknown) {
  useNoticeStore.getState().showError(parseError(error));
}

export function showSuccessNotice(message: string) {
  useNoticeStore.getState().showSuccess(message);
}

export function showInfoNotice(message: string) {
  useNoticeStore.getState().showInfo(message);
}

export function showUndoNotice(message: string, label: string, onAction: () => void) {
  useNoticeStore.getState().showInfo(message, {
    durationMs: 6000,
    action: { label, onAction },
  });
}

export function showMessageNotice(message: string) {
  showInfoNotice(message);
}
