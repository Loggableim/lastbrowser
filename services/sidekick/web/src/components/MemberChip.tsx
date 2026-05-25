import { useCallback, useRef, useState, type DragEvent } from "react";
import { cn } from "@/lib/utils";
import type { DiscordMember } from "@/lib/api";

interface MemberChipProps {
  member: DiscordMember;
  roleColor: number;
  onDragStart?: (member: DiscordMember, event: DragEvent) => void;
  onDragEnd?: (member: DiscordMember, event: DragEvent) => void;
  compact?: boolean;
}

/**
 * Draggable member chip displaying avatar and username.
 *
 * Uses the HTML5 Drag & Drop API. The chip renders a small avatar circle
 * and the display name (truncated). When dragged, it scales up slightly
 * and gains a drop shadow via the drag-image polyfill approach.
 */
export function MemberChip({
  member,
  roleColor,
  onDragStart,
  onDragEnd,
  compact = false,
}: MemberChipProps) {
  const [dragging, setDragging] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const hexColor = `#${roleColor.toString(16).padStart(6, "0")}`;

  const handleDragStart = useCallback(
    (e: DragEvent) => {
      setDragging(true);
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", JSON.stringify(member));

      // Custom drag image: clone the element and use it as ghost
      if (ref.current) {
        const ghost = ref.current.cloneNode(true) as HTMLElement;
        ghost.style.position = "absolute";
        ghost.style.top = "-1000px";
        ghost.style.left = "-1000px";
        ghost.style.transform = "scale(1.1)";
        ghost.style.opacity = "0.8";
        document.body.appendChild(ghost);
        e.dataTransfer.setDragImage(ghost, 50, 20);
        requestAnimationFrame(() => document.body.removeChild(ghost));
      }

      onDragStart?.(member, e);
    },
    [member, onDragStart],
  );

  const handleDragEnd = useCallback(
    (e: DragEvent) => {
      setDragging(false);
      onDragEnd?.(member, e);
    },
    [member, onDragEnd],
  );

  const initials = member.display_name
    ? member.display_name.charAt(0).toUpperCase()
    : member.username.charAt(0).toUpperCase();

  return (
    <div
      ref={ref}
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      className={cn(
        "group inline-flex cursor-grab items-center gap-1.5 rounded px-1.5 py-1 text-xs transition-all",
        "border border-transparent hover:border-current/20 hover:bg-midground/5",
        "active:cursor-grabbing",
        dragging && "scale-105 opacity-60 shadow-lg",
        compact ? "max-w-[120px]" : "max-w-[160px]",
      )}
      title={`${member.display_name} — ${member.username}`}
    >
      {/* Avatar circle */}
      <span
        className="relative flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[0.55rem] font-bold uppercase"
        style={{
          backgroundColor: hexColor,
          color: luminance(roleColor) > 128 ? "#000" : "#fff",
        }}
      >
        {member.avatar_url ? (
          <img
            src={member.avatar_url}
            alt=""
            className="h-full w-full rounded-full object-cover"
            loading="lazy"
          />
        ) : (
          initials
        )}
      </span>

      {/* Username */}
      <span className="truncate text-muted-foreground/90 transition-colors group-hover:text-midground">
        {member.display_name || member.username}
      </span>
    </div>
  );
}

/** Simple relative luminance approximation for text contrast. */
function luminance(hexColor: number): number {
  const r = (hexColor >> 16) & 0xff;
  const g = (hexColor >> 8) & 0xff;
  const b = hexColor & 0xff;
  return 0.299 * r + 0.587 * g + 0.114 * b;
}
