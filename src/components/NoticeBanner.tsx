import { AnimatePresence, motion } from "motion/react";
import { AlertTriangle } from "lucide-react";
import { useNoticeStore } from "@/stores/noticeStore";

export function NoticeBanner() {
  const notice = useNoticeStore((s) => s.notice);
  const clear = useNoticeStore((s) => s.clear);

  return (
    <AnimatePresence>
      {notice && (
        <motion.div
          key={notice.id}
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ duration: 0.18 }}
          className="pointer-events-auto fixed left-1/2 top-4 z-[120] w-[min(560px,calc(100%-2rem))] -translate-x-1/2 border border-danger/30 bg-surface-1/95 shadow-2xl backdrop-blur"
          role="alert"
          aria-live="assertive"
        >
          <div className="flex items-start gap-3 px-4 py-3">
            <AlertTriangle size={16} className="mt-0.5 shrink-0 text-danger" />
            <p className="min-w-0 flex-1 text-[14px] leading-6 text-text-1">{notice.text}</p>
            <button
              type="button"
              onClick={clear}
              className="shrink-0 p-1 text-text-3 transition-colors hover:bg-surface-2 hover:text-text-1"
              aria-label="Dismiss"
            >
              ✕
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
