import { useMemo } from "react";
import { Trash2 } from "lucide-react";
import { t } from "@/i18n";
import { cn, getOverdueDays, getTodayDateKey } from "@/lib/utils";
import { useTodoStore } from "@/stores/todoStore";
import { useSettingsStore } from "@/stores/settingsStore";
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
  const clearCompleted = useTodoStore((s) => s.clearCompleted);
  const filterTagIds = useTodoStore((s) => s.filterTagIds);
  const locale = useSettingsStore((s) => s.locale);
  const todayK = getTodayDateKey();

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
    (td) => !td.completed && getOverdueDays(td.targetDate, todayK) > 0,
  ).length;

  return (
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

      <div className="flex min-w-[150px] flex-1 justify-end">
        {doneN > 0 && (
          <button
            type="button"
            onClick={clearCompleted}
            className="inline-flex items-center gap-1.5 px-3 py-1 text-[13px] text-text-3 transition-colors hover:bg-danger/10 hover:text-danger"
          >
            <Trash2 size={14} />
            {t("action.clear_completed", locale)}
          </button>
        )}
      </div>
    </div>
  );
}
