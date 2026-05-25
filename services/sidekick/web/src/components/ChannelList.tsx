import { useState, useCallback, type DragEvent } from "react";
import {
  RefreshCw,
  Hash,
  Volume2,
  FolderOpen,
  MessageSquare,
} from "lucide-react";
import { Button } from "@nous-research/ui/ui/components/button";
import { Spinner } from "@nous-research/ui/ui/components/spinner";
import { GuildSelector } from "@/components/GuildSelector";
import { ChannelListItem } from "@/components/ChannelListItem";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { DiscordChannel, DiscordGuild } from "@/lib/api";
import { useToast } from "@/hooks/useToast";
import { Toast } from "@/components/Toast";

interface ChannelListProps {
  guilds: DiscordGuild[];
  selectedGuildId: string | null;
  channels: DiscordChannel[];
  channelsLoading: boolean;
  guildsLoading: boolean;
  onSelectGuild: (guildId: string) => void;
  onRefresh: () => void;
  onReorder: (
    channelId: string,
    newPosition: number,
    newParentId: string | null,
  ) => Promise<void>;
}

export function ChannelList({
  guilds,
  selectedGuildId,
  channels,
  channelsLoading,
  guildsLoading,
  onSelectGuild,
  onRefresh,
  onReorder,
}: ChannelListProps) {
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const { toast, showToast } = useToast();

  const sortedChannels = [...channels].sort(
    (a, b) => a.position - b.position,
  );

  // Channels grouped by category for visual nesting
  const topLevelChannels = sortedChannels.filter(
    (ch) => ch.parent_id === null,
  );

  const handleDragStart = useCallback(
    (_channel: DiscordChannel, _event: DragEvent<HTMLDivElement>) => {
      setDraggingId(_channel.id);
    },
    [],
  );

  const handleDragOver = useCallback(
    (channel: DiscordChannel, event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setDragOverId(channel.id);
    },
    [],
  );

  const handleDrop = useCallback(
    async (targetChannel: DiscordChannel, _event: DragEvent<HTMLDivElement>) => {
      setDraggingId(null);
      setDragOverId(null);

      // Read the dragged channel id from dataTransfer
      const draggedId = _event.dataTransfer.getData("text/plain");
      if (!draggedId || draggedId === targetChannel.id) return;

      const draggedIndex = sortedChannels.findIndex((c) => c.id === draggedId);
      const targetIndex = sortedChannels.findIndex(
        (c) => c.id === targetChannel.id,
      );
      if (draggedIndex === -1 || targetIndex === -1) return;

      const dragged = sortedChannels[draggedIndex];

      // Determine new position: place before the target
      let newPosition = targetChannel.position;
      let newParentId = targetChannel.parent_id;

      // If dropped on a category, nest under it
      if (targetChannel.type === "category") {
        newParentId = targetChannel.id;
        // Place at the beginning of the category's children
        const childrenInCategory = sortedChannels.filter(
          (c) => c.parent_id === targetChannel.id,
        );
        newPosition =
          childrenInCategory.length > 0
            ? childrenInCategory[0].position - 1
            : targetChannel.position + 1;
      } else if (dragged.position < targetChannel.position) {
        // Dragging downward — place at target position
        newPosition = targetChannel.position;
      } else {
        // Dragging upward — place one above target
        newPosition = Math.max(0, targetChannel.position - 0);
        newPosition = targetChannel.position;
      }

      // Keep position non-negative
      newPosition = Math.max(0, newPosition);

      try {
        await onReorder(dragged.id, newPosition, newParentId);
        showToast(`Moved #${dragged.name}`, "success");
      } catch {
        showToast("Failed to reorder channel", "error");
      }
    },
    [sortedChannels, onReorder, showToast],
  );

  const handleDragEnd = useCallback(() => {
    setDraggingId(null);
    setDragOverId(null);
  }, []);

  const channelTypeIcon = (type: string) => {
    switch (type) {
      case "text":
        return <Hash className="h-3 w-3" />;
      case "voice":
        return <Volume2 className="h-3 w-3" />;
      case "category":
        return <FolderOpen className="h-3 w-3" />;
      case "forum":
        return <MessageSquare className="h-3 w-3" />;
      default:
        return <Hash className="h-3 w-3" />;
    }
  };

  const typeLabel = (type: string): string => {
    switch (type) {
      case "text":
        return "Text";
      case "voice":
        return "Voice";
      case "category":
        return "Category";
      case "forum":
        return "Forum";
      default:
        return type;
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-4">
          <CardTitle>Channels</CardTitle>
          <Button
            ghost
            size="sm"
            disabled={channelsLoading || guildsLoading}
            onClick={onRefresh}
            aria-label="Refresh channels"
          >
            {channelsLoading ? (
              <Spinner className="h-3.5 w-3.5" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        <GuildSelector
          guilds={guilds}
          selectedGuildId={selectedGuildId}
          onSelect={onSelectGuild}
          loading={guildsLoading}
        />

        {!selectedGuildId ? (
          <p className="py-8 text-center text-[0.75rem] tracking-[0.06em] text-midground/40 normal-case">
            Select a Discord server to view its channels
          </p>
        ) : channelsLoading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-[0.8rem] text-midground/50">
            <Spinner />
            <span>Loading channels...</span>
          </div>
        ) : sortedChannels.length === 0 ? (
          <p className="py-8 text-center text-[0.75rem] tracking-[0.06em] text-midground/40 normal-case">
            No channels found for this server
          </p>
        ) : (
          <div className="divide-y divide-current/5">
            {sortedChannels.map((channel) => (
              <div
                key={channel.id}
                className={cn(
                  "relative",
                  channel.parent_id && "ml-5 border-l border-current/10 pl-3",
                )}
              >
                {channel.type === "category" && (
                  <div className="flex items-center gap-2 px-3 py-1.5 text-[0.65rem] font-semibold tracking-[0.1em] uppercase text-midground/40">
                    {channelTypeIcon(channel.type)}
                    {channel.name}
                  </div>
                )}
                {channel.type !== "category" && (
                  <ChannelListItem
                    channel={channel}
                    onDragStart={handleDragStart}
                    onDragOver={handleDragOver}
                    onDrop={handleDrop}
                    onDragEnd={handleDragEnd}
                    isDragOver={dragOverId === channel.id}
                    isDragging={draggingId === channel.id}
                  />
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <Toast toast={toast} />
    </Card>
  );
}
