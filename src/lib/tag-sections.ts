import type { Tag, TagGroup } from "@/types";

export interface TagSection {
  id: string;
  group: TagGroup | null;
  tags: Tag[];
}

interface BuildTagSectionsOptions {
  includeEmptyGroups?: boolean;
  includeUngrouped?: boolean;
}

export function buildTagSections(
  tags: Tag[],
  tagGroups: TagGroup[],
  options: BuildTagSectionsOptions = {},
): TagSection[] {
  const { includeEmptyGroups = false, includeUngrouped = true } = options;
  const sortedGroups = tagGroups.slice().sort((a, b) => a.order - b.order);

  const sections: TagSection[] = sortedGroups
    .map((group) => ({
      id: group.id,
      group,
      tags: tags.filter((tag) => tag.groupId === group.id),
    }))
    .filter((section) => includeEmptyGroups || section.tags.length > 0);

  const ungroupedTags = tags.filter((tag) => tag.groupId === null);
  if (includeUngrouped && (includeEmptyGroups || ungroupedTags.length > 0)) {
    sections.push({
      id: "__ungrouped",
      group: null,
      tags: ungroupedTags,
    });
  }

  return sections;
}
