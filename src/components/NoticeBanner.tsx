import { AnimatePresence, motion } from "motion/react";
import { AlertTriangle, CheckCircle2, Info, RotateCcw } from "lucide-react";
import { useNoticeStore } from "@/stores/noticeStore";

export function NoticeBanner() {
  const notice = useNoticeStore((s) => s.notice);
  const clear = useNoticeStore((s) => s.clear);
  const triggerAction = useNoticeStore((s) => s.triggerAction);

  const tone =
    notice?.kind === "success"
      ? {
          icon: CheckCircle2,
          border: "border-success/30",
          iconColor: "text-success",
          role: "status" as const,
        }
      : notice?.kind === "info"
        ? {
            icon: Info,
            border: "border-accent/30",
            iconColor: "text-accent",
            role: "status" as const,
          }
        : {
            icon: AlertTriangle,
            border: "border-danger/30",
            iconColor: "text-danger",
            role: "alert" as const,
          };

  return (
    <AnimatePresence>
      {notice && (
        <motion.div
          key={notice.id}
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ duration: 0.18 }}
          className={`pointer-events-auto fixed left-1/2 top-4 z-[120] w-[min(640px,calc(100%-2rem))] -translate-x-1/2 border bg-surface-1/95 shadow-2xl backdrop-blur ${tone.border}`}
          role={tone.role}
          aria-live={notice.kind === "error" ? "assertive" : "polite"}
        >
          <div className="flex items-start gap-3 px-4 py-3">
            <tone.icon size={16} className={`mt-0.5 shrink-0 ${tone.iconColor}`} />
            <div className="min-w-0 flex-1">
              <p className="text-[14px] leading-6 text-text-1">{notice.text}</p>
              {notice.action && (
                <button
                  type="button"
                  onClick={triggerAction}
                  className="mt-2 inline-flex items-center gap-1.5 text-[13px] font-medium text-accent transition-colors hover:text-accent/80"
                >
                  <RotateCcw size={13} />
                  {notice.action.label}
                </button>
              )}
            </div>
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
