import { useState, useRef, useEffect } from "react";
import { Hash, Lock, Plus } from "lucide-react";
import { cn, formatHourLabel } from "@/lib/utils";
import { isMobile } from "@/lib/platform";
import { t } from "@/i18n";
import { useTodoStore } from "@/stores/todoStore";
import { useTagStore } from "@/stores/tagStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { TagBadge } from "@/components/TagBadge";
import type { PlanningBoard, Tag } from "@/types";

const mobile = isMobile();

interface Props {
  board: PlanningBoard;
  targetDate: string;
  disabled?: boolean;
  focusSignal?: number;
}

export function TodoInput({ board, targetDate, disabled = false, focusSignal = 0 }: Props) {
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
  const tagGroups = useTagStore((s) => s.tagGroups);
  const addTag = useTagStore((s) => s.addTag);

  useEffect(() => {
    const h = (e: PointerEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setShowPicker(false);
    };
    document.addEventListener("pointerdown", h);
    return () => document.removeEventListener("pointerdown", h);
  }, []);

  useEffect(() => {
    if (mobile) return;
    if (!disabled) inputRef.current?.focus();
  }, [disabled, focusSignal]);

  const filtered = tags.filter(
    (tg) =>
      tg.name.toLowerCase().includes(search.toLowerCase()) && !sel.some((s) => s.id === tg.id),
  );

  function submit(e: React.SyntheticEvent<HTMLFormElement>) {
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
    if (!mobile) inputRef.current?.focus();
  }
  function pick(tag: Tag) {
    setSel((p) => [...p, tag]);
    setSearch("");
    setShowPicker(false);
    if (!mobile) inputRef.current?.focus();
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
          "flex items-center gap-3 border bg-surface-1 px-4 transition-all",
          mobile ? "py-2.5" : "py-1.5",
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
            className={cn(
              "min-w-[120px] flex-1 bg-transparent text-text-1 outline-none placeholder:text-text-3",
              mobile ? "text-[15px]" : "text-[14px]",
            )}
          />
        </div>
        <div className="relative" ref={pickerRef}>
          <button
            type="button"
            onClick={() => setShowPicker(!showPicker)}
            className={cn(
              "text-text-3 transition-colors hover:bg-surface-2 hover:text-text-2",
              mobile ? "p-2" : "p-1.5",
            )}
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
                      if (filtered.length > 0) {
                        pick(filtered[0]);
                      } else if (search.trim()) {
                        pick(addTag(search.trim()));
                      }
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
                    className={cn(
                      "flex w-full items-center gap-3 text-left text-text-1 transition-colors hover:bg-surface-2",
                      mobile ? "px-4 py-3.5 text-[16px]" : "px-4 py-3 text-[16px]",
                    )}
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
                    {t(tagGroups.length > 0 ? "tag.create_ungrouped" : "tag.create", locale, {
                      name: search.trim(),
                    })}
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
