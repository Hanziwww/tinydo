import { t } from "@/i18n";
import { useSettingsStore } from "@/stores/settingsStore";
import { useTagStore } from "@/stores/tagStore";
import { useTodoStore } from "@/stores/todoStore";
import { TagBadge } from "./TagBadge";

export function TagFilter() {
  const locale = useSettingsStore((s) => s.locale);
  const tags = useTagStore((s) => s.tags);
  const tagGroups = useTagStore((s) => s.tagGroups);
  const filterTagIds = useTodoStore((s) => s.filterTagIds);
  const toggleFilterTag = useTodoStore((s) => s.toggleFilterTag);
  const clearFilterTags = useTodoStore((s) => s.clearFilterTags);
  if (tags.length === 0) return null;

  const groups = tagGroups
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((g) => ({ group: g, tags: tags.filter((tg) => tg.groupId === g.id) }))
    .filter((g) => g.tags.length > 0);
  const ungrouped = tags.filter((tg) => tg.groupId === null);

  return (
    <div className="mt-2.5 flex flex-wrap items-center gap-x-5 gap-y-2">
      {groups.map(({ group, tags: gTags }) => (
        <div key={group.id} className="flex items-center gap-3">
          <span className="text-[15px] font-semibold text-text-3">{group.name}</span>
          {gTags.map((tg) => (
            <TagBadge
              key={tg.id}
              tag={tg}
              selected={filterTagIds.includes(tg.id)}
              onClick={() => toggleFilterTag(tg.id)}
            />
          ))}
        </div>
      ))}
      {ungrouped.length > 0 && (
        <div className="flex items-center gap-3">
          {tagGroups.length > 0 && (
            <span className="text-[15px] font-semibold text-text-3">
              {t("tag.ungrouped", locale)}
            </span>
          )}
          {ungrouped.map((tg) => (
            <TagBadge
              key={tg.id}
              tag={tg}
              selected={filterTagIds.includes(tg.id)}
              onClick={() => toggleFilterTag(tg.id)}
            />
          ))}
        </div>
      )}
      {filterTagIds.length > 0 && (
        <button
          type="button"
          onClick={clearFilterTags}
          className="px-3 py-1.5 text-[15px] text-text-3 transition-colors hover:bg-surface-2 hover:text-text-2"
        >
          {t("tag.clear", locale)}
        </button>
      )}
    </div>
  );
}
