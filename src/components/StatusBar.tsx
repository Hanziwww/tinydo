import { useCallback, useMemo, useRef } from "react";
import { Archive, CheckSquare, ImageDown, Trash2, X } from "lucide-react";
import { t } from "@/i18n";
import { isMobile } from "@/lib/platform";

const mobile = isMobile();
const iconBtnCls = mobile
  ? "inline-flex h-9 w-9 items-center justify-center text-text-3 transition-colors"
  : "inline-flex h-7 w-7 items-center justify-center text-text-3 transition-colors";
import { isTodoCompletedForDate, isTodoVisibleOnBoard } from "@/lib/todo-helpers";
import {
  cn,
  formatDate,
  getOverdueDays,
  getTodayDateKey,
  getTodayDate,
  getTomorrowDateKey,
  getTomorrowDate,
} from "@/lib/utils";
import { useTodoStore } from "@/stores/todoStore";
import { useTagStore } from "@/stores/tagStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { PosterPreview } from "@/components/PosterPreview";
import { exportPoster } from "@/lib/poster";
import { showErrorNotice, showSuccessNotice } from "@/lib/errorNotice";
import type { PlanningBoard, ViewMode } from "@/types";

const VIEWS: { value: ViewMode; key: string }[] = [
  { value: "all", key: "view.all" },
  { value: "active", key: "view.active" },
  { value: "completed", key: "view.completed" },
];
interface Props {
  board: PlanningBoard;
  boardDate: string;
  searchQuery: string;
}

export function StatusBar({ board, boardDate, searchQuery }: Props) {
  const todos = useTodoStore((s) => s.todos);
  const viewMode = useTodoStore((s) => s.viewMode);
  const setViewMode = useTodoStore((s) => s.setViewMode);
  const archiveBoardCompleted = useTodoStore((s) => s.archiveBoardCompleted);
  const selectionMode = useTodoStore((s) => s.selectionMode);
  const selectedTodoIds = useTodoStore((s) => s.selectedTodoIds);
  const setSelectionMode = useTodoStore((s) => s.setSelectionMode);
  const setSelectedTodoIds = useTodoStore((s) => s.setSelectedTodoIds);
  const clearSelectedTodos = useTodoStore((s) => s.clearSelectedTodos);
  const batchMoveSelected = useTodoStore((s) => s.batchMoveSelected);
  const batchDeleteSelected = useTodoStore((s) => s.batchDeleteSelected);
  const filterTagIds = useTodoStore((s) => s.filterTagIds);
  const tags = useTagStore((s) => s.tags);
  const locale = useSettingsStore((s) => s.locale);
  const theme = useSettingsStore((s) => s.theme);
  const todayK = getTodayDateKey();
  const tomorrowK = getTomorrowDateKey();
  const effectiveBoardDate = board === "today" ? todayK : boardDate;
  const posterRef = useRef<HTMLDivElement>(null);

  const scoped = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    let list = todos.filter((todo) => isTodoVisibleOnBoard(todo, board, boardDate, todayK));
    if (filterTagIds.length > 0)
      list = list.filter((td) => filterTagIds.some((id) => td.tagIds.includes(id)));
    if (query) list = list.filter((todo) => todo.title.toLowerCase().includes(query));
    return list;
  }, [board, boardDate, filterTagIds, searchQuery, todayK, todos]);

  const activeN = scoped.filter((todo) => !isTodoCompletedForDate(todo, effectiveBoardDate)).length;
  const doneN = scoped.filter((todo) => isTodoCompletedForDate(todo, effectiveBoardDate)).length;
  const odN = scoped.filter(
    (todo) =>
      !isTodoCompletedForDate(todo, effectiveBoardDate) &&
      getOverdueDays(todo.targetDate, todayK, todo.durationDays) > 0,
  ).length;

  const posterTitle =
    board === "today" ? t("poster.title_today", locale) : t("poster.title_tomorrow", locale);
  const posterDateLabel = formatDate(
    board === "today" ? getTodayDate() : getTomorrowDate(),
    locale,
  );
  const allVisibleSelected =
    scoped.length > 0 && scoped.every((todo) => selectedTodoIds.includes(todo.id));
  const selectedVisibleCount = scoped.filter((todo) => selectedTodoIds.includes(todo.id)).length;

  const handleExportPoster = useCallback(async () => {
    if (!posterRef.current) return;
    const name = board === "today" ? "tinydo-today" : "tinydo-tomorrow";
    const dateStr = new Date().toISOString().slice(0, 10);
    try {
      const saved = await exportPoster(posterRef.current, `${name}-${dateStr}.png`);
      if (saved) {
        showSuccessNotice(t("notice.poster_saved", locale));
      }
    } catch (err) {
      console.error("Poster export failed:", err);
      showErrorNotice(err);
    }
  }, [board, locale]);

  const handleArchive = useCallback(() => {
    archiveBoardCompleted(boardDate);
  }, [archiveBoardCompleted, boardDate]);

  return (
    <>
      <div className={cn("border-t border-border", mobile ? "px-4 mobile-safe-bottom" : "px-6")}>
        {/* Stats line */}
        <div className="flex items-center py-1.5">
          <span className="flex-1 text-[13px] text-text-2">
            {t("status.active", locale, { n: activeN })}
            {doneN > 0 && ` · ${t("status.completed", locale, { n: doneN })}`}
            {board === "today" && odN > 0 && ` · ${t("status.overdue", locale, { n: odN })}`}
          </span>
        </div>

        {/* View tabs + action icons — same row */}
        <div className="flex items-center gap-2 pb-2">
          <div className="flex shrink-0 items-center gap-1 border border-border bg-surface-2/90 p-1">
            {selectionMode ? (
              <span className="px-3 py-1 text-[13px] font-medium text-text-2">
                {t("batch.selected", locale, { n: selectedVisibleCount || selectedTodoIds.length })}
              </span>
            ) : (
              VIEWS.map((v) => (
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
              ))
            )}
          </div>

          <div className="flex flex-1 items-center justify-end gap-1">
            {selectionMode ? (
              <>
                <button
                  type="button"
                  onClick={() =>
                    allVisibleSelected
                      ? clearSelectedTodos()
                      : setSelectedTodoIds(scoped.map((todo) => todo.id))
                  }
                  className="px-3 py-1 text-[13px] font-medium text-text-3 transition-colors hover:bg-surface-2 hover:text-text-1"
                >
                  {allVisibleSelected
                    ? t("batch.clear", locale)
                    : t("batch.select_visible", locale)}
                </button>
                <button
                  type="button"
                  onClick={() => batchMoveSelected(todayK)}
                  className="px-3 py-1 text-[13px] font-medium text-text-3 transition-colors hover:bg-surface-2 hover:text-text-1"
                >
                  {t("detail.move_today", locale)}
                </button>
                <button
                  type="button"
                  onClick={() => batchMoveSelected(tomorrowK)}
                  className="px-3 py-1 text-[13px] font-medium text-text-3 transition-colors hover:bg-surface-2 hover:text-text-1"
                >
                  {t("detail.move_tomorrow", locale)}
                </button>
                <button
                  type="button"
                  onClick={batchDeleteSelected}
                  className={cn(iconBtnCls, "hover:bg-danger/10 hover:text-danger")}
                  title={t("batch.delete", locale)}
                >
                  <Trash2 size={15} />
                </button>
                <button
                  type="button"
                  onClick={() => setSelectionMode(false)}
                  className={cn(iconBtnCls, "hover:bg-surface-2 hover:text-text-1")}
                  title={t("batch.exit", locale)}
                >
                  <X size={15} />
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setSelectionMode(true)}
                  className={cn(iconBtnCls, "hover:bg-accent/10 hover:text-accent")}
                  title={t("batch.enter", locale)}
                >
                  <CheckSquare size={15} />
                </button>
                <button
                  type="button"
                  onClick={handleExportPoster}
                  className={cn(iconBtnCls, "hover:bg-accent/10 hover:text-accent")}
                  title={t("action.export_poster", locale)}
                >
                  <ImageDown size={15} />
                </button>
              </>
            )}
            {!selectionMode && doneN > 0 && (
              <button
                type="button"
                onClick={handleArchive}
                className={cn(iconBtnCls, "hover:bg-accent/10 hover:text-accent")}
                title={t("action.archive_completed", locale)}
              >
                <Archive size={15} />
              </button>
            )}
          </div>
        </div>
      </div>
      {/* Hidden poster render target */}
      <div style={{ position: "fixed", left: -9999, top: -9999 }}>
        <PosterPreview
          ref={posterRef}
          title={posterTitle}
          dateLabel={posterDateLabel}
          boardDate={effectiveBoardDate}
          todos={scoped}
          allTodos={todos}
          tags={tags}
          locale={locale}
          theme={theme}
        />
      </div>
    </>
  );
}
