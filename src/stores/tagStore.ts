import { create } from "zustand";
import { persist } from "zustand/middleware";
import { nanoid } from "nanoid";
import type { Tag, TagGroup } from "@/types";
import { getRandomTagColor } from "@/lib/utils";

interface TagState {
  tags: Tag[];
  tagGroups: TagGroup[];
  addTag: (name: string, groupId?: string | null) => Tag;
  updateTag: (id: string, updates: Partial<Omit<Tag, "id">>) => void;
  deleteTag: (id: string) => void;
  addTagGroup: (name: string) => TagGroup;
  updateTagGroup: (id: string, updates: Partial<Omit<TagGroup, "id">>) => void;
  deleteTagGroup: (id: string) => void;
}

const SEED_TAG_GROUPS: TagGroup[] = [
  { id: "grp-study", name: "学业", order: 0 },
  { id: "grp-life", name: "生活", order: 1 },
];

const SEED_TAGS: Tag[] = [
  { id: "tag-audio", name: "听力学", color: "#f97316", groupId: "grp-study" },
  { id: "tag-code", name: "编程", color: "#6366f1", groupId: "grp-study" },
  { id: "tag-paper", name: "论文", color: "#3b82f6", groupId: "grp-study" },
  { id: "tag-lab", name: "实验", color: "#ec4899", groupId: "grp-study" },
  { id: "tag-health", name: "锻炼", color: "#22c55e", groupId: "grp-life" },
  { id: "tag-errand", name: "杂事", color: "#8b5cf6", groupId: "grp-life" },
  { id: "tag-reading", name: "阅读", color: "#06b6d4", groupId: null },
];

export const useTagStore = create<TagState>()(
  persist(
    (set) => ({
      tags: SEED_TAGS,
      tagGroups: SEED_TAG_GROUPS,

      addTag: (name, groupId = null) => {
        const tag: Tag = { id: nanoid(), name, color: getRandomTagColor(), groupId };
        set((s) => ({ tags: [...s.tags, tag] }));
        return tag;
      },

      updateTag: (id, updates) =>
        set((s) => ({ tags: s.tags.map((t) => (t.id === id ? { ...t, ...updates } : t)) })),

      deleteTag: (id) => set((s) => ({ tags: s.tags.filter((t) => t.id !== id) })),

      addTagGroup: (name) => {
        const group: TagGroup = { id: nanoid(), name, order: 0 };
        set((s) => ({ tagGroups: [...s.tagGroups, { ...group, order: s.tagGroups.length }] }));
        return group;
      },

      updateTagGroup: (id, updates) =>
        set((s) => ({
          tagGroups: s.tagGroups.map((g) => (g.id === id ? { ...g, ...updates } : g)),
        })),

      deleteTagGroup: (id) =>
        set((s) => ({
          tagGroups: s.tagGroups.filter((g) => g.id !== id),
          tags: s.tags.map((t) => (t.groupId === id ? { ...t, groupId: null } : t)),
        })),
    }),
    {
      name: "tinydo-tags",
      version: 2,
      migrate: () => ({ tags: SEED_TAGS, tagGroups: SEED_TAG_GROUPS }),
    },
  ),
);
