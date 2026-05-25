import { useCallback, useState, type DragEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Users } from "lucide-react";
import type { DiscordMember, DiscordRole } from "@/lib/api";
import { MemberChip } from "@/components/MemberChip";

interface RoleDropZoneProps {
  role: DiscordRole;
  members: DiscordMember[];
  onDropMember: (member: DiscordMember, targetRole: DiscordRole) => void;
  /** If true, shows a compact member preview limited to 5 chips. */
  compact?: boolean;
}

/**
 * A role card that acts as a drop zone for member chips.
 *
 * Displays the role name, color swatch, member count, and a list of
 * member chips. When a member is dragged over, the card highlights to
 * indicate it's a valid drop target. On drop, calls `onDropMember` with
 * the dragged member and this role.
 */
export function RoleDropZone({
  role,
  members,
  onDropMember,
  compact = false,
}: RoleDropZoneProps) {
  const [dragOver, setDragOver] = useState(false);
  const [dropInvalid, setDropInvalid] = useState(false);

  const hexColor = `#${role.color.toString(16).padStart(6, "0")}`;
  const maxPreview = compact ? 5 : 20;
  const previewMembers = members.slice(0, maxPreview);
  const overflow = members.length - maxPreview;

  const handleDragOver = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = "move";
      setDragOver(true);
      setDropInvalid(false);
    },
    [],
  );

  const handleDragLeave = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragOver(false);
      setDropInvalid(false);
    },
    [],
  );

  const handleDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragOver(false);
      setDropInvalid(false);

      try {
        const data = e.dataTransfer.getData("text/plain");
        if (!data) return;
        const draggedMember = JSON.parse(data) as DiscordMember;

        // Don't allow dropping a member who already has this role
        if (draggedMember.role_ids.includes(role.id)) {
          setDropInvalid(true);
          setTimeout(() => setDropInvalid(false), 600);
          return;
        }

        onDropMember(draggedMember, role);
      } catch {
        // Invalid drag data — ignore
      }
    },
    [role, onDropMember],
  );

  const chipLabel = members.length === 1 ? "member" : "members";

  return (
    <div
      role="region"
      aria-label={`${role.name} role`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={cn(
        "group flex min-w-[220px] max-w-[300px] flex-col gap-2 rounded border px-3 py-2.5 transition-all duration-150",
        "border-border bg-card/60",
        dragOver &&
          "border-accent bg-accent/10 shadow-[0_0_16px_-4px_var(--color-accent)]",
        dropInvalid && "border-destructive bg-destructive/10",
      )}
      title={`Drag members here to assign the ${role.name} role`}
    >
      {/* Role header */}
      <div className="flex items-center gap-2">
        {/* Color swatch */}
        <span
          className="h-3 w-3 shrink-0 rounded-sm"
          style={{ backgroundColor: hexColor }}
          aria-hidden
        />

        {/* Role name */}
        <span
          className="flex-1 truncate text-xs font-bold uppercase tracking-wider text-midground"
          title={role.name}
        >
          {role.name}
        </span>

        {/* Member count */}
        <span
          className={cn(
            "flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[0.6rem] uppercase tracking-wider",
            "bg-midground/10 text-muted-foreground",
          )}
        >
          <Users className="h-2.5 w-2.5" aria-hidden />
          {members.length} {chipLabel}
        </span>
      </div>

      {/* Member chips */}
      {previewMembers.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {previewMembers.map((member) => (
            <MemberChip
              key={member.id}
              member={member}
              roleColor={role.color}
              compact={compact}
            />
          ))}

          {overflow > 0 && (
            <span className="flex items-center px-1.5 text-[0.6rem] uppercase tracking-wider text-muted-foreground/60">
              +{overflow} more
            </span>
          )}
        </div>
      ) : (
        <span className="py-2 text-center text-[0.6rem] uppercase tracking-wider text-muted-foreground/40">
          No members
        </span>
      )}

      {/* Drop hint — visible on drag-over and on hover */}
      {dragOver && (
        <span className="text-center text-[0.55rem] uppercase tracking-widest text-accent/70">
          Drop to assign {role.name}
        </span>
      )}

      {dropInvalid && (
        <span className="text-center text-[0.55rem] uppercase tracking-widest text-destructive/70">
          Already has this role
        </span>
      )}
    </div>
  );
}
