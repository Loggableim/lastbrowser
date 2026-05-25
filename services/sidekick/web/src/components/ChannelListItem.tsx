import { type DragEvent, useCallback, useRef } from "react";
import { Hash, Volume2, FolderOpen, MessageSquare, GripVertical } from "lucide-react";
import type { DiscordChannel } from "@/lib/api";
import { cn } from "@/lib/utils";

const TYPE_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  text: Hash,
  voice: Volume2,
  category: FolderOpen,
  forum: MessageSquare,
  announcement: MessageSquare,
  stage: Volume2,
};

interface ChannelListItemProps {
  channel: DiscordChannel;
  onDragStart: (channel: DiscordChannel, event: DragEvent<HTMLDivElement>) => void;
  onDragOver: (channel: DiscordChannel, event: DragEvent<HTMLDivElement>) => void;
  onDrop: (channel: DiscordChannel, event: DragEvent<HTMLDivElement>) => void;
  onDragEnd: (event: DragEvent<HTMLDivElement>) => void;
  isDragOver: boolean;
  isDragging: boolean;
}

export function ChannelListItem({
  channel,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  isDragOver,
  isDragging,
}: ChannelListItemProps) {
  const Icon = TYPE_ICON[channel.type] ?? Hash;
  const itemRef = useRef<HTMLDivElement>(null);

  const handleDragStart = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", channel.id);
      // Slight opacity on drag image
      if (itemRef.current) {
        e.dataTransfer.setDragImage(itemRef.current, 0, 0);
      }
      onDragStart(channel, e);
    },
    [channel, onDragStart],
  );

  const handleDragOver = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      onDragOver(channel, e);
    },
    [channel, onDragOver],
  );

  const handleDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      onDrop(channel, e);
    },
    [channel, onDrop],
  );

  return (
    <div
      ref={itemRef}
      draggable
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onDragEnd={onDragEnd}
      className={cn(
        "group flex items-center gap-2 px-3 py-2",
        "border-b border-current/5 last:border-b-0",
        "transition-all duration-150 ease-out",
        "cursor-default select-none",
        isDragging && "opacity-40 scale-[1.02]",
        isDragOver && "bg-midground/10",
      )}
    >
      {/* Drag handle */}
      <span
        className={cn(
          "flex shrink-0 cursor-grab items-center text-midground/30",
          "transition-colors group-hover:text-midground/60",
          "active:cursor-grabbing",
        )}
        aria-label={`Drag ${channel.name} to reorder`}
      >
        <GripVertical className="h-3.5 w-3.5" />
      </span>

      {/* Type icon */}
      <Icon className="h-3.5 w-3.5 shrink-0 text-midground/50" />

      {/* Channel name */}
      <span
        className={cn(
          "min-w-0 flex-1 truncate text-[0.8rem] tracking-[0.02em]",
          channel.type === "category"
            ? "font-semibold text-midground/80"
            : "font-normal text-midground/65",
        )}
      >
        {channel.type === "voice" ? "🔊 " : channel.type === "category" ? "📁 " : "# "}
        {channel.name}
      </span>

      {/* Position badge */}
      <span className="shrink-0 text-[0.6rem] tracking-[0.08em] text-midground/30">
        #{channel.position}
      </span>

      {/* Drop indicator — visible when drag-over */}
      <span
        aria-hidden
        className={cn(
          "absolute bottom-0 left-3 right-3 h-px bg-midground/40",
          "transition-opacity duration-150",
          isDragOver ? "opacity-100" : "opacity-0",
        )}
      />
    </div>
  );
}
