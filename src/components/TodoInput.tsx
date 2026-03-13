import { useState, useRef, useEffect } from "react";
import { Hash, Lock, Plus } from "lucide-react";
import { cn, formatHourLabel } from "@/lib/utils";
import { t } from "@/i18n";
import { useTodoStore } from "@/stores/todoStore";
import { useTagStore } from "@/stores/tagStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { TagBadge } from "@/components/TagBadge";
import type { PlanningBoard, Tag } from "@/types";

interface Props {
  board: PlanningBoard;
  targetDate: string;
  disabled?: boolean;
}

export function TodoInput({ board, targetDate, disabled = false }: Props) {
  const [title, setTitle] = useState("");
  const [sel, setSel] = useState<Tag[]>([]);
  const [showPicker, setShowPicker] = useState(false);
  const [search, setSearch] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const locale = useSettingsStore((s) => s.locale);
  const unlockHour = useSettingsStore((s) => s.tomorrowPlanningUnlockHour);
  const addTodo = useTodoStore((s) => s.addTodo);
  const tags = useTagStore((s) => s.tags);
  const addTag = useTagStore((s) => s.addTag);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setShowPicker(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const filtered = tags.filter(
    (tg) =>
      tg.name.toLowerCase().includes(search.toLowerCase()) && !sel.some((s) => s.id === tg.id),
  );

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (disabled) return;
    const v = title.trim();
    if (!v) return;
    addTodo(
      v,
      sel.map((tg) => tg.id),
      targetDate,
    );
    setTitle("");
    setSel([]);
    inputRef.current?.focus();
  }
  function pick(tag: Tag) {
    setSel((p) => [...p, tag]);
    setSearch("");
    setShowPicker(false);
    inputRef.current?.focus();
  }

  if (disabled) {
    return (
      <div className="flex items-center gap-3 border border-border bg-surface-2 px-4 py-1.5 text-[14px] text-text-3">
        <Lock size={18} />
        {t("planning.locked_input", locale, { time: formatHourLabel(unlockHour, locale) })}
      </div>
    );
  }

  return (
    <form onSubmit={submit}>
      <div
        className={cn(
          "flex items-center gap-3 border bg-surface-1 px-4 py-1.5 transition-all",
          "border-border focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/20",
        )}
      >
        <Plus size={16} className="shrink-0 text-accent" />
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          {sel.map((tg) => (
            <TagBadge
              key={tg.id}
              tag={tg}
              removable
              onRemove={() => setSel((p) => p.filter((x) => x.id !== tg.id))}
            />
          ))}
          <input
            ref={inputRef}
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={
              board === "today"
                ? t("todo.placeholder.today", locale)
                : t("todo.placeholder.tomorrow", locale)
            }
            className="min-w-[180px] flex-1 bg-transparent text-[14px] text-text-1 outline-none placeholder:text-text-3"
          />
        </div>
        <div className="relative" ref={pickerRef}>
          <button
            type="button"
            onClick={() => setShowPicker(!showPicker)}
            className="p-1.5 text-text-3 transition-colors hover:bg-surface-2 hover:text-text-2"
          >
            <Hash size={16} />
          </button>
          {showPicker && (
            <div className="absolute right-0 top-full z-50 mt-2 w-72 overflow-hidden border border-border bg-surface-1 shadow-lg">
              <div className="p-3">
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t("tag.search", locale)}
                  className="w-full border border-border bg-surface-2 px-4 py-3 text-[16px] text-text-1 outline-none placeholder:text-text-3"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      filtered.length > 0
                        ? pick(filtered[0])
                        : search.trim() && pick(addTag(search.trim()));
                    }
                  }}
                />
              </div>
              <div className="max-h-60 overflow-y-auto px-1.5 pb-2">
                {filtered.map((tg) => (
                  <button
                    key={tg.id}
                    type="button"
                    onClick={() => pick(tg)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left text-[16px] text-text-1 transition-colors hover:bg-surface-2"
                  >
                    <span className="h-3 w-3" style={{ backgroundColor: tg.color }} />
                    {tg.name}
                  </button>
                ))}
                {search.trim() && filtered.length === 0 && (
                  <button
                    type="button"
                    onClick={() => pick(addTag(search.trim()))}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left text-[16px] font-medium text-accent hover:bg-accent-soft"
                  >
                    <Plus size={16} />
                    {t("tag.create", locale, { name: search.trim() })}
                  </button>
                )}
                {!search && filtered.length === 0 && (
                  <p className="px-4 py-3 text-[15px] text-text-3">{t("tag.no_tags", locale)}</p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </form>
  );
}
