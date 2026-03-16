import { create } from "zustand";
import { nanoid } from "nanoid";
import type { Tag, TagGroup } from "@/types";
import { getRandomTagColor } from "@/lib/utils";
import * as backend from "@/lib/backend";

interface TagState {
  tags: Tag[];
  tagGroups: TagGroup[];
  _hydrated: boolean;
  _hydrate: (tags: Tag[], tagGroups: TagGroup[]) => void;
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

export { SEED_TAGS, SEED_TAG_GROUPS };

export const useTagStore = create<TagState>()((set) => ({
  tags: [],
  tagGroups: [],
  _hydrated: false,

  _hydrate: (tags, tagGroups) => set({ tags, tagGroups, _hydrated: true }),

  addTag: (name, groupId = null) => {
    const tag: Tag = { id: nanoid(), name, color: getRandomTagColor(), groupId };
    set((s) => ({ tags: [...s.tags, tag] }));
    backend.saveTag(tag).catch((e: unknown) => console.error("Failed to save tag:", e));
    return tag;
  },

  updateTag: (id, updates) => {
    set((s) => {
      const tags = s.tags.map((t) => (t.id === id ? { ...t, ...updates } : t));
      const updated = tags.find((t) => t.id === id);
      if (updated) backend.saveTag(updated).catch((e: unknown) => console.error("Failed to save tag:", e));
      return { tags };
    });
  },

  deleteTag: (id) => {
    set((s) => ({ tags: s.tags.filter((t) => t.id !== id) }));
    backend.deleteTag(id).catch((e: unknown) => console.error("Failed to delete tag:", e));
  },

  addTagGroup: (name) => {
    const group: TagGroup = { id: nanoid(), name, order: 0 };
    set((s) => {
      const updated = { ...group, order: s.tagGroups.length };
      backend.saveTagGroup(updated).catch((e: unknown) => console.error("Failed to save tag group:", e));
      return { tagGroups: [...s.tagGroups, updated] };
    });
    return group;
  },

  updateTagGroup: (id, updates) => {
    set((s) => {
      const tagGroups = s.tagGroups.map((g) => (g.id === id ? { ...g, ...updates } : g));
      const updated = tagGroups.find((g) => g.id === id);
      if (updated)
        backend.saveTagGroup(updated).catch((e: unknown) => console.error("Failed to save tag group:", e));
      return { tagGroups };
    });
  },

  deleteTagGroup: (id) => {
    set((s) => ({
      tagGroups: s.tagGroups.filter((g) => g.id !== id),
      tags: s.tags.map((t) => {
        if (t.groupId === id) {
          const updated = { ...t, groupId: null };
          backend.saveTag(updated).catch((e: unknown) => console.error("Failed to save tag:", e));
          return updated;
        }
        return t;
      }),
    }));
    backend.deleteTagGroup(id).catch((e: unknown) => console.error("Failed to delete tag group:", e));
  },
}));
