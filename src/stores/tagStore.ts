import { create } from "zustand";
import { nanoid } from "nanoid";
import type { Tag, TagGroup } from "@/types";
import { getRandomTagColor } from "@/lib/utils";
import * as backend from "@/lib/backend";
import { showErrorNotice } from "@/lib/errorNotice";

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
  moveTagGroup: (id: string, direction: -1 | 1) => void;
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

type TagRollbackState = Pick<TagState, "tags" | "tagGroups">;

function rollbackTagState(previous: Partial<TagRollbackState>, error: unknown) {
  useTagStore.setState(previous);
  showErrorNotice(error);
}

export const useTagStore = create<TagState>()((set, get) => ({
  tags: [],
  tagGroups: [],
  _hydrated: false,

  _hydrate: (tags, tagGroups) => set({ tags, tagGroups, _hydrated: true }),

  addTag: (name, groupId = null) => {
    const tag: Tag = { id: nanoid(), name, color: getRandomTagColor(), groupId };
    set((s) => ({ tags: [...s.tags, tag] }));
    void backend.saveTag(tag).catch((error: unknown) => showErrorNotice(error));
    return tag;
  },

  updateTag: (id, updates) => {
    set((s) => {
      const tags = s.tags.map((t) => (t.id === id ? { ...t, ...updates } : t));
      const updated = tags.find((t) => t.id === id);
      if (updated) {
        void backend.saveTag(updated).catch((error: unknown) => showErrorNotice(error));
      }
      return { tags };
    });
  },

  deleteTag: (id) => {
    const previousTags = get().tags;
    set((s) => ({ tags: s.tags.filter((t) => t.id !== id) }));
    void backend
      .deleteTag(id)
      .catch((error: unknown) => rollbackTagState({ tags: previousTags }, error));
  },

  addTagGroup: (name) => {
    const group: TagGroup = { id: nanoid(), name, order: 0 };
    set((s) => {
      const updated = { ...group, order: s.tagGroups.length };
      void backend.saveTagGroup(updated).catch((error: unknown) => showErrorNotice(error));
      return { tagGroups: [...s.tagGroups, updated] };
    });
    return group;
  },

  updateTagGroup: (id, updates) => {
    set((s) => {
      const tagGroups = s.tagGroups.map((g) => (g.id === id ? { ...g, ...updates } : g));
      const updated = tagGroups.find((g) => g.id === id);
      if (updated) {
        void backend.saveTagGroup(updated).catch((error: unknown) => showErrorNotice(error));
      }
      return { tagGroups };
    });
  },

  moveTagGroup: (id, direction) => {
    const previous = { tagGroups: get().tagGroups };
    const sorted = [...previous.tagGroups].sort((a, b) => a.order - b.order);
    const index = sorted.findIndex((group) => group.id === id);
    const swapIndex = index + direction;
    if (index === -1 || swapIndex < 0 || swapIndex >= sorted.length) return;

    [sorted[index], sorted[swapIndex]] = [sorted[swapIndex], sorted[index]];
    const reordered = sorted.map((group, order) => ({ ...group, order }));
    set({ tagGroups: reordered });
    void Promise.all(reordered.map((group) => backend.saveTagGroup(group))).catch(
      (error: unknown) => rollbackTagState(previous, error),
    );
  },

  deleteTagGroup: (id) => {
    const previous = {
      tags: get().tags,
      tagGroups: get().tagGroups,
    };
    const updatedTags = previous.tags.map((tag) =>
      tag.groupId === id ? { ...tag, groupId: null } : tag,
    );
    const affectedTags = updatedTags.filter(
      (tag) =>
        tag.groupId === null &&
        previous.tags.some((prev) => prev.id === tag.id && prev.groupId === id),
    );

    set({
      tagGroups: previous.tagGroups.filter((group) => group.id !== id),
      tags: updatedTags,
    });

    void Promise.all([
      backend.deleteTagGroup(id),
      ...affectedTags.map((tag) => backend.saveTag(tag)),
    ]).catch((error: unknown) => rollbackTagState(previous, error));
  },
}));
