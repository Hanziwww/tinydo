import { useState } from "react";
import { Plus, Trash2, ChevronDown, ChevronRight, Palette, FolderOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { t } from "@/i18n";
import { useTagStore } from "@/stores/tagStore";
import { useTodoStore } from "@/stores/todoStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { TagBadge } from "./TagBadge";
import type { Tag } from "@/types";

const COLOR_OPTIONS = [
  "#6366f1",
  "#8b5cf6",
  "#ec4899",
  "#f43f5e",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#14b8a6",
  "#06b6d4",
  "#3b82f6",
];

export function TagManager() {
  const [newTagName, setNewTagName] = useState("");
  const [newGroupName, setNewGroupName] = useState("");
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(["__ungrouped"]));
  const [editingTagId, setEditingTagId] = useState<string | null>(null);

  const locale = useSettingsStore((s) => s.locale);
  const tags = useTagStore((s) => s.tags);
  const tagGroups = useTagStore((s) => s.tagGroups);
  const addTag = useTagStore((s) => s.addTag);
  const updateTag = useTagStore((s) => s.updateTag);
  const deleteTag = useTagStore((s) => s.deleteTag);
  const addTagGroup = useTagStore((s) => s.addTagGroup);
  const deleteTagGroup = useTagStore((s) => s.deleteTagGroup);
  const removeTagFromAllTodos = useTodoStore((s) => s.removeTagFromAllTodos);

  const groupedTags = tagGroups.map((g) => ({
    group: g,
    tags: tags.filter((tag) => tag.groupId === g.id),
  }));
  const ungroupedTags = tags.filter((tag) => tag.groupId === null);

  function toggleGroup(id: string) {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleAddTag(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!newTagName.trim()) return;
    addTag(newTagName.trim(), selectedGroupId);
    setNewTagName("");
  }

  function handleAddGroup(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!newGroupName.trim()) return;
    const group = addTagGroup(newGroupName.trim());
    setNewGroupName("");
    setExpandedGroups((prev) => new Set([...prev, group.id]));
  }

  function handleDeleteTag(tagId: string) {
    deleteTag(tagId);
    removeTagFromAllTodos(tagId);
  }

  function renderTagList(tagList: Tag[], groupId?: string) {
    return (
      <div className="space-y-0.5 pl-4">
        {tagList.map((tag) => (
          <div
            key={tag.id}
            className="group/tag flex items-center gap-2 px-2 py-1 transition-colors hover:bg-surface-2"
          >
            <TagBadge tag={tag} />
            <div className="flex-1" />

            {editingTagId === tag.id ? (
              <div className="flex gap-0.5">
                {COLOR_OPTIONS.map((color) => (
                  <button
                    key={color}
                    onClick={() => {
                      updateTag(tag.id, { color });
                      setEditingTagId(null);
                    }}
                    className={cn(
                      "h-4 w-4 transition-transform hover:scale-125",
                      tag.color === color && "ring-2 ring-white/50",
                    )}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            ) : (
              <div className="flex gap-1 opacity-0 transition-opacity group-hover/tag:opacity-100">
                {tagGroups.length > 0 && (
                  <select
                    value={tag.groupId || ""}
                    onChange={(e) =>
                      updateTag(tag.id, {
                        groupId: e.target.value || null,
                      })
                    }
                    className="bg-surface-2 px-2 py-1 text-[15px] text-text-2 outline-none"
                  >
                    <option value="">{t("tag.ungrouped", locale)}</option>
                    {tagGroups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                        {g.id === groupId ? ` (${t("tag.current", locale)})` : ""}
                      </option>
                    ))}
                  </select>
                )}
                <button
                  onClick={() => setEditingTagId(tag.id)}
                  className="p-0.5 text-text-3 transition-colors hover:text-accent"
                >
                  <Palette size={12} />
                </button>
                <button
                  onClick={() => handleDeleteTag(tag.id)}
                  className="p-0.5 text-text-3 transition-colors hover:text-danger"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-medium text-text-2">{t("tag.manage", locale)}</h3>
      </div>

      {/* Add tag group */}
      <form onSubmit={handleAddGroup} className="flex gap-1.5">
        <input
          value={newGroupName}
          onChange={(e) => setNewGroupName(e.target.value)}
          placeholder={t("tag.new_group", locale)}
          className="flex-1 bg-surface-2 px-2.5 py-1.5 text-xs text-text-1 outline-none placeholder:text-text-3 focus:ring-1 focus:ring-border"
        />
        <button
          type="submit"
          className="bg-surface-2 p-1.5 text-text-3 transition-colors hover:bg-surface-3 hover:text-accent"
        >
          <FolderOpen size={14} />
        </button>
      </form>

      {/* Add tag */}
      <form onSubmit={handleAddTag} className="flex gap-1.5">
        <input
          value={newTagName}
          onChange={(e) => setNewTagName(e.target.value)}
          placeholder={t("tag.new_tag", locale)}
          className="flex-1 bg-surface-2 px-2.5 py-1.5 text-xs text-text-1 outline-none placeholder:text-text-3 focus:ring-1 focus:ring-border"
        />
        {tagGroups.length > 0 && (
          <select
            value={selectedGroupId || ""}
            onChange={(e) => setSelectedGroupId(e.target.value || null)}
            className="bg-surface-2 px-1.5 py-1.5 text-xs text-text-2 outline-none"
          >
            <option value="">{t("tag.ungrouped", locale)}</option>
            {tagGroups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        )}
        <button
          type="submit"
          className="bg-surface-2 p-1.5 text-text-3 transition-colors hover:bg-surface-3 hover:text-accent"
        >
          <Plus size={14} />
        </button>
      </form>

      {/* Tag groups */}
      <div className="space-y-1">
        {groupedTags.map(({ group, tags: gTags }) => (
          <div key={group.id} className="group/grp">
            <div className="flex items-center gap-1">
              <button
                onClick={() => toggleGroup(group.id)}
                className="flex flex-1 items-center gap-1.5 px-1.5 py-1 text-xs font-medium text-text-2 transition-colors hover:bg-surface-2"
              >
                {expandedGroups.has(group.id) ? (
                  <ChevronDown size={12} />
                ) : (
                  <ChevronRight size={12} />
                )}
                {group.name}
                <span className="text-text-3">({gTags.length})</span>
              </button>
              <button
                onClick={() => deleteTagGroup(group.id)}
                className="p-0.5 text-text-3 opacity-0 transition-all hover:text-danger group-hover/grp:opacity-100"
              >
                <Trash2 size={11} />
              </button>
            </div>
            {expandedGroups.has(group.id) && renderTagList(gTags, group.id)}
          </div>
        ))}

        {ungroupedTags.length > 0 && (
          <div>
            <button
              onClick={() => toggleGroup("__ungrouped")}
              className="flex items-center gap-1.5 px-1.5 py-1 text-xs font-medium text-text-2 transition-colors hover:bg-surface-2"
            >
              {expandedGroups.has("__ungrouped") ? (
                <ChevronDown size={12} />
              ) : (
                <ChevronRight size={12} />
              )}
              {t("tag.ungrouped", locale)}
              <span className="text-text-3">({ungroupedTags.length})</span>
            </button>
            {expandedGroups.has("__ungrouped") && renderTagList(ungroupedTags)}
          </div>
        )}
      </div>
    </div>
  );
}
