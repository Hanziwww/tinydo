import { X } from "lucide-react";
import { cn, hexToRgba } from "@/lib/utils";
import type { Tag } from "@/types";

interface Props {
  tag: Tag;
  removable?: boolean;
  selected?: boolean;
  onClick?: () => void;
  onRemove?: () => void;
}

export function TagBadge({ tag, removable, selected, onClick, onRemove }: Props) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap border px-2 py-0.5 text-[13px] font-medium transition-all",
        onClick && "cursor-pointer hover:brightness-110",
        selected && "ring-2 ring-accent ring-offset-1 ring-offset-surface-1",
      )}
      style={{
        backgroundColor: hexToRgba(tag.color, 0.08),
        color: tag.color,
        borderColor: hexToRgba(tag.color, 0.18),
      }}
      onClick={onClick}
    >
      {tag.name}
      {removable && (
        <button
          type="button"
          className="ml-0.5 p-0.5 hover:bg-black/10"
          onClick={(e) => {
            e.stopPropagation();
            onRemove?.();
          }}
        >
          <X size={10} />
        </button>
      )}
    </span>
  );
}
