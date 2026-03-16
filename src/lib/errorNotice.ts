import { parseError } from "@/lib/backend";
import { useNoticeStore } from "@/stores/noticeStore";

export function showErrorNotice(error: unknown) {
  useNoticeStore.getState().showError(parseError(error));
}

export function showMessageNotice(message: string) {
  useNoticeStore.getState().showError(message);
}
