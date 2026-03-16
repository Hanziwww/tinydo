import { useCallback, useMemo, useRef } from "react";
import { Archive, ImageDown } from "lucide-react";
import { t } from "@/i18n";
import {
  cn,
  formatDate,
  getOverdueDays,
  getTodayDateKey,
  getTodayDate,
  getTomorrowDate,
} from "@/lib/utils";
import { useTodoStore } from "@/stores/todoStore";
import { useTagStore } from "@/stores/tagStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { PosterPreview } from "@/components/PosterPreview";
import { exportPoster } from "@/lib/poster";
import type { PlanningBoard, ViewMode } from "@/types";

const VIEWS: { value: ViewMode; key: string }[] = [
  { value: "all", key: "view.all" },
  { value: "active", key: "view.active" },
  { value: "completed", key: "view.completed" },
];
interface Props {
  board: PlanningBoard;
  boardDate: string;
}

export function StatusBar({ board, boardDate }: Props) {
  const todos = useTodoStore((s) => s.todos);
  const viewMode = useTodoStore((s) => s.viewMode);
  const setViewMode = useTodoStore((s) => s.setViewMode);
  const archiveBoardCompleted = useTodoStore((s) => s.archiveBoardCompleted);
  const filterTagIds = useTodoStore((s) => s.filterTagIds);
  const tags = useTagStore((s) => s.tags);
  const locale = useSettingsStore((s) => s.locale);
  const theme = useSettingsStore((s) => s.theme);
  const todayK = getTodayDateKey();
  const posterRef = useRef<HTMLDivElement>(null);

  const scoped = useMemo(() => {
    let list = todos.filter((td) =>
      board === "today" ? td.targetDate <= todayK : td.targetDate === boardDate,
    );
    if (filterTagIds.length > 0)
      list = list.filter((td) => filterTagIds.some((id) => td.tagIds.includes(id)));
    return list;
  }, [board, boardDate, filterTagIds, todayK, todos]);

  const activeN = scoped.filter((td) => !td.completed).length;
  const doneN = scoped.filter((td) => td.completed).length;
  const odN = scoped.filter(
    (td) => !td.completed && getOverdueDays(td.targetDate, todayK, td.durationDays) > 0,
  ).length;

  const posterTitle =
    board === "today" ? t("poster.title_today", locale) : t("poster.title_tomorrow", locale);
  const posterDateLabel = formatDate(
    board === "today" ? getTodayDate() : getTomorrowDate(),
    locale,
  );

  const handleExportPoster = useCallback(async () => {
    if (!posterRef.current) return;
    const name = board === "today" ? "tinydo-today" : "tinydo-tomorrow";
    const dateStr = new Date().toISOString().slice(0, 10);
    try {
      await exportPoster(posterRef.current, `${name}-${dateStr}.png`);
    } catch (err) {
      console.error("Poster export failed:", err);
    }
  }, [board]);

  const handleArchive = useCallback(() => {
    archiveBoardCompleted(boardDate);
  }, [archiveBoardCompleted, boardDate]);

  return (
    <>
      <div className="flex flex-wrap items-center gap-3 border-t border-border px-6 py-2">
        <span className="min-w-[180px] flex-1 text-[13px] text-text-2">
          {t("status.active", locale, { n: activeN })}
          {doneN > 0 && ` · ${t("status.completed", locale, { n: doneN })}`}
          {board === "today" && odN > 0 && ` · ${t("status.overdue", locale, { n: odN })}`}
        </span>

        <div className="flex shrink-0 items-center gap-1 border border-border bg-surface-2/90 p-1">
          {VIEWS.map((v) => (
            <button
              key={v.value}
              type="button"
              onClick={() => setViewMode(v.value)}
              className={cn(
                "px-3 py-1 text-[13px] font-medium transition-all",
                viewMode === v.value
                  ? "bg-surface-1 text-text-1 shadow-sm"
                  : "text-text-3 hover:bg-surface-1/70 hover:text-text-2",
              )}
            >
              {t(v.key, locale)}
            </button>
          ))}
        </div>

        <div className="flex flex-1 items-center justify-end gap-1">
          <button
            type="button"
            onClick={handleExportPoster}
            className="inline-flex h-7 w-7 items-center justify-center text-text-3 transition-colors hover:bg-accent/10 hover:text-accent"
            title={t("action.export_poster", locale)}
          >
            <ImageDown size={15} />
          </button>
          {doneN > 0 && (
            <button
              type="button"
              onClick={handleArchive}
              className="inline-flex h-7 w-7 items-center justify-center text-text-3 transition-colors hover:bg-accent/10 hover:text-accent"
              title={t("action.archive_completed", locale)}
            >
              <Archive size={15} />
            </button>
          )}
        </div>
      </div>
      {/* Hidden poster render target */}
      <div style={{ position: "fixed", left: -9999, top: -9999 }}>
        <PosterPreview
          ref={posterRef}
          title={posterTitle}
          dateLabel={posterDateLabel}
          todos={scoped}
          tags={tags}
          locale={locale}
          theme={theme}
        />
      </div>
    </>
  );
}
