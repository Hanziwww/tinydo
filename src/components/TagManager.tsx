import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  FolderOpen,
  Palette,
  Pencil,
  Trash2,
  X,
} from "lucide-react";
import { buildTagSections } from "@/lib/tag-sections";
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

const UNGROUPED_SECTION_ID = "__ungrouped";

export function TagManager() {
  const [newGroupName, setNewGroupName] = useState("");
  const [newTagNames, setNewTagNames] = useState<Partial<Record<string, string>>>({});
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    new Set([UNGROUPED_SECTION_ID]),
  );
  const [editingTagId, setEditingTagId] = useState<string | null>(null);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [tagDraftName, setTagDraftName] = useState("");
  const [groupDraftName, setGroupDraftName] = useState("");
  const [colorPickerTagId, setColorPickerTagId] = useState<string | null>(null);
  const [hoveredGroupId, setHoveredGroupId] = useState<string | null>(null);

  const locale = useSettingsStore((s) => s.locale);
  const tags = useTagStore((s) => s.tags);
  const tagGroups = useTagStore((s) => s.tagGroups);
  const addTag = useTagStore((s) => s.addTag);
  const updateTag = useTagStore((s) => s.updateTag);
  const deleteTag = useTagStore((s) => s.deleteTag);
  const addTagGroup = useTagStore((s) => s.addTagGroup);
  const updateTagGroup = useTagStore((s) => s.updateTagGroup);
  const moveTagGroup = useTagStore((s) => s.moveTagGroup);
  const deleteTagGroup = useTagStore((s) => s.deleteTagGroup);
  const removeTagFromAllTodos = useTodoStore((s) => s.removeTagFromAllTodos);

  const sections = useMemo(
    () => buildTagSections(tags, tagGroups, { includeEmptyGroups: true, includeUngrouped: true }),
    [tagGroups, tags],
  );
  const sortedGroups = useMemo(
    () => tagGroups.slice().sort((a, b) => a.order - b.order),
    [tagGroups],
  );

  function toggleGroup(id: string) {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleAddTag(
    sectionId: string,
    groupId: string | null,
    e: React.SyntheticEvent<HTMLFormElement>,
  ) {
    e.preventDefault();
    const value = (newTagNames[sectionId] ?? "").trim();
    if (!value) return;
    addTag(value, groupId);
    setNewTagNames((prev) => ({ ...prev, [sectionId]: "" }));
  }

  function handleAddGroup(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!newGroupName.trim()) return;
    const group = addTagGroup(newGroupName.trim());
    setNewGroupName("");
    setExpandedGroups((prev) => new Set([...prev, group.id]));
    setNewTagNames((prev) => ({ ...prev, [group.id]: "" }));
  }

  function handleDeleteTag(tagId: string) {
    deleteTag(tagId);
    removeTagFromAllTodos(tagId);
  }

  function startTagRename(tag: Tag) {
    setEditingTagId(tag.id);
    setTagDraftName(tag.name);
    setColorPickerTagId(null);
  }

  function submitTagRename(tag: Tag) {
    const nextName = tagDraftName.trim();
    if (nextName) updateTag(tag.id, { name: nextName });
    setEditingTagId(null);
    setTagDraftName("");
  }

  function startGroupRename(groupId: string, currentName: string) {
    setEditingGroupId(groupId);
    setGroupDraftName(currentName);
  }

  function submitGroupRename(groupId: string) {
    const nextName = groupDraftName.trim();
    if (nextName) updateTagGroup(groupId, { name: nextName });
    setEditingGroupId(null);
    setGroupDraftName("");
  }

  function renderTagList(tagList: Tag[], groupId?: string) {
    return (
      <div className="space-y-0.5 pl-3">
        {tagList.map((tag) => (
          <div
            key={tag.id}
            className="group/tag rounded-md border border-transparent px-2.5 py-1.5 transition-colors hover:border-border/60 hover:bg-surface-2"
          >
            {editingTagId === tag.id ? (
              <div className="flex items-center gap-2">
                <input
                  value={tagDraftName}
                  onChange={(e) => setTagDraftName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") submitTagRename(tag);
                    if (e.key === "Escape") {
                      setEditingTagId(null);
                      setTagDraftName("");
                    }
                  }}
                  className="min-w-0 flex-1 bg-transparent text-[15px] text-text-1 outline-none"
                  autoFocus
                />
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => submitTagRename(tag)}
                    className="p-1 text-text-3 transition-colors hover:text-accent"
                    title={t("action.save", locale)}
                  >
                    <Check size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingTagId(null);
                      setTagDraftName("");
                    }}
                    className="p-1 text-text-3 transition-colors hover:text-text-1"
                    title={t("action.cancel", locale)}
                  >
                    <X size={13} />
                  </button>
                </div>
              </div>
            ) : (
              <>
                <TagBadge tag={tag} />
                <div className="grid grid-rows-[0fr] transition-[grid-template-rows] duration-200 ease-out group-hover/tag:grid-rows-[1fr]">
                  <div className="overflow-hidden">
                    <div className="flex flex-wrap items-center gap-1.5 pt-1.5 opacity-0 transition-opacity duration-150 group-hover/tag:opacity-100">
                      {tagGroups.length > 0 && (
                        <select
                          value={tag.groupId || ""}
                          onChange={(e) =>
                            updateTag(tag.id, {
                              groupId: e.target.value || null,
                            })
                          }
                          className="min-w-0 max-w-[140px] bg-surface-2 px-2 py-1 text-[13px] text-text-2 outline-none"
                        >
                          <option value="">{t("tag.ungrouped", locale)}</option>
                          {sortedGroups.map((g) => (
                            <option key={g.id} value={g.id}>
                              {g.name}
                              {g.id === groupId ? ` (${t("tag.current", locale)})` : ""}
                            </option>
                          ))}
                        </select>
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          setColorPickerTagId((current) => (current === tag.id ? null : tag.id))
                        }
                        className="p-1 text-text-3 transition-colors hover:text-accent"
                        title={t("tag.color", locale)}
                      >
                        <Palette size={13} />
                      </button>
                      <button
                        type="button"
                        onClick={() => startTagRename(tag)}
                        className="p-1 text-text-3 transition-colors hover:text-accent"
                        title={t("tag.rename", locale)}
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteTag(tag.id)}
                        className="p-1 text-text-3 transition-colors hover:text-danger"
                        title={t("tag.delete", locale)}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                </div>
              </>
            )}
            {colorPickerTagId === tag.id && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {COLOR_OPTIONS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => {
                      updateTag(tag.id, { color });
                      setColorPickerTagId(null);
                    }}
                    className={cn(
                      "h-5 w-5 transition-transform hover:scale-110",
                      tag.color === color && "ring-2 ring-white/50",
                    )}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    );
  }

  function renderCreateTagInput(sectionId: string, groupId: string | null) {
    return (
      <form onSubmit={(e) => handleAddTag(sectionId, groupId, e)} className="pl-3">
        <input
          value={newTagNames[sectionId] ?? ""}
          onChange={(e) =>
            setNewTagNames((prev) => ({
              ...prev,
              [sectionId]: e.target.value,
            }))
          }
          placeholder={t("tag.new_tag", locale)}
          className="w-full bg-surface-2 px-3 py-2 text-[15px] text-text-1 outline-none placeholder:text-text-3 focus:ring-1 focus:ring-border"
        />
      </form>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="text-[15px] font-medium text-text-2">{t("tag.manage", locale)}</h3>
      </div>

      {/* Add tag group */}
      <form onSubmit={handleAddGroup} className="flex gap-1.5">
        <input
          value={newGroupName}
          onChange={(e) => setNewGroupName(e.target.value)}
          placeholder={t("tag.new_group", locale)}
          className="flex-1 bg-surface-2 px-3 py-2 text-[15px] text-text-1 outline-none placeholder:text-text-3 focus:ring-1 focus:ring-border"
        />
        <button
          type="submit"
          className="bg-surface-2 px-3 text-text-3 transition-colors hover:bg-surface-3 hover:text-accent"
        >
          <FolderOpen size={16} />
        </button>
      </form>

      {/* Tag groups */}
      <div className="space-y-1">
        {sections.map(({ id, group, tags: sectionTags }) => {
          const isHovered = hoveredGroupId === id;
          return (
            <div
              key={id}
              onMouseEnter={() => setHoveredGroupId(id)}
              onMouseLeave={() => setHoveredGroupId(null)}
            >
              <div
                className={cn(
                  "flex items-center gap-1 transition-all duration-200",
                  isHovered && "pl-2",
                )}
              >
                <div className="flex flex-1 items-center gap-1.5 px-1.5 py-1.5 text-[15px] font-medium text-text-2 transition-colors hover:bg-surface-2">
                  <button type="button" onClick={() => toggleGroup(id)} className="shrink-0">
                    {expandedGroups.has(id) ? (
                      <ChevronDown size={12} />
                    ) : (
                      <ChevronRight size={12} />
                    )}
                  </button>
                  {group && editingGroupId === group.id ? (
                    <input
                      value={groupDraftName}
                      onChange={(e) => setGroupDraftName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") submitGroupRename(group.id);
                        if (e.key === "Escape") {
                          setEditingGroupId(null);
                          setGroupDraftName("");
                        }
                      }}
                      className="min-w-0 flex-1 bg-transparent text-[15px] text-text-1 outline-none"
                      autoFocus
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => toggleGroup(id)}
                      className="min-w-0 flex-1 text-left"
                    >
                      {group ? group.name : t("tag.ungrouped", locale)}
                    </button>
                  )}
                  <AnimatePresence mode="wait">
                    {group && isHovered ? null : (
                      <motion.span
                        key="count"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.15 }}
                        className="text-text-3"
                      >
                        ({sectionTags.length})
                      </motion.span>
                    )}
                  </AnimatePresence>
                </div>
                <AnimatePresence>
                  {group && isHovered && (
                    <motion.div
                      key="actions"
                      initial={{ opacity: 0, x: 6 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 6 }}
                      transition={{ duration: 0.18 }}
                      className="flex items-center gap-0.5"
                    >
                      {editingGroupId === group.id ? (
                        <>
                          <button
                            type="button"
                            onClick={() => submitGroupRename(group.id)}
                            className="p-0.5 text-text-3 transition-colors hover:text-accent"
                            title={t("action.save", locale)}
                          >
                            <Check size={11} />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingGroupId(null);
                              setGroupDraftName("");
                            }}
                            className="p-0.5 text-text-3 transition-colors hover:text-text-1"
                            title={t("action.cancel", locale)}
                          >
                            <X size={11} />
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => moveTagGroup(group.id, -1)}
                            className="p-0.5 text-text-3 transition-colors hover:text-accent"
                            title={t("tag.move_up", locale)}
                          >
                            <ChevronUp size={11} />
                          </button>
                          <button
                            type="button"
                            onClick={() => moveTagGroup(group.id, 1)}
                            className="p-0.5 text-text-3 transition-colors hover:text-accent"
                            title={t("tag.move_down", locale)}
                          >
                            <ChevronDown size={11} />
                          </button>
                          <button
                            type="button"
                            onClick={() => startGroupRename(group.id, group.name)}
                            className="p-0.5 text-text-3 transition-colors hover:text-accent"
                            title={t("tag.rename_group", locale)}
                          >
                            <Pencil size={11} />
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteTagGroup(group.id)}
                            className="p-0.5 text-text-3 transition-colors hover:text-danger"
                            title={t("tag.delete_group", locale)}
                          >
                            <Trash2 size={11} />
                          </button>
                        </>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              {expandedGroups.has(id) && (
                <div className="space-y-2">
                  {sectionTags.length > 0 && renderTagList(sectionTags, group?.id)}
                  {renderCreateTagInput(id, group?.id ?? null)}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
