import { useCallback, useEffect, useState } from "react";
import { MessageSquare, Shield } from "lucide-react";
import { api } from "@/lib/api";
import type { DiscordChannel, DiscordGuild } from "@/lib/api";
import { usePageHeader } from "@/contexts/usePageHeader";
import { PluginSlot } from "@/plugins";
import { ChannelList } from "@/components/ChannelList";
import { RolePanel } from "@/components/RolePanel";
import { cn } from "@/lib/utils";

interface DiscordPayload {
  guilds: DiscordGuild[];
  selectedGuildId: string | null;
  channels: DiscordChannel[];
  guildsLoading: boolean;
  channelsLoading: boolean;
}

export default function DiscordPage() {
  const [state, setState] = useState<DiscordPayload>({
    guilds: [],
    selectedGuildId: null,
    channels: [],
    guildsLoading: true,
    channelsLoading: false,
  });

  const [activeTab, setActiveTab] = useState<"channels" | "roles">("channels");

  const { setEnd } = usePageHeader();

  const loadGuilds = useCallback(async () => {
    setState((s) => ({ ...s, guildsLoading: true }));
    try {
      const resp = await api.getDiscordGuilds();
      const guilds = resp.guilds ?? [];
      setState((s) => ({
        ...s,
        guilds,
        guildsLoading: false,
        // Auto-select the first guild
        selectedGuildId: s.selectedGuildId ?? (guilds[0]?.id ?? null),
      }));
    } catch {
      setState((s) => ({ ...s, guilds: [], guildsLoading: false }));
    }
  }, []);

  const loadChannels = useCallback(async (guildId: string) => {
    setState((s) => ({ ...s, channelsLoading: true }));
    try {
      const resp = await api.getDiscordChannels(guildId);
      setState((s) => ({
        ...s,
        channels: resp.channels ?? [],
        channelsLoading: false,
      }));
    } catch {
      setState((s) => ({ ...s, channels: [], channelsLoading: false }));
    }
  }, []);

  // Load guilds on mount
  useEffect(() => {
    void loadGuilds();
  }, [loadGuilds]);

  // Load channels when selected guild changes
  useEffect(() => {
    if (state.selectedGuildId) {
      void loadChannels(state.selectedGuildId);
    } else {
      setState((s) => ({ ...s, channels: [] }));
    }
  }, [state.selectedGuildId, loadChannels]);

  // Refresh button in page header
  useEffect(() => {
    setEnd(
      <button
        type="button"
        onClick={() => {
          void loadGuilds();
          if (state.selectedGuildId) void loadChannels(state.selectedGuildId);
        }}
        disabled={state.guildsLoading || state.channelsLoading}
        className="inline-flex items-center gap-2 rounded-none border border-current/25 px-3 py-1.5 font-mondwest text-[0.65rem] tracking-[0.1em] uppercase transition-colors hover:bg-current/10 disabled:opacity-40"
      >
        <MessageSquare className="h-3.5 w-3.5" />
        Refresh
      </button>,
    );
    return () => setEnd(null);
  }, [setEnd, loadGuilds, loadChannels, state.selectedGuildId, state.guildsLoading, state.channelsLoading]);

  const handleSelectGuild = useCallback(
    (guildId: string) => {
      setState((s) => ({ ...s, selectedGuildId: guildId }));
    },
    [],
  );

  const handleReorder = useCallback(
    async (
      channelId: string,
      newPosition: number,
      newParentId: string | null,
    ) => {
      // Optimistic update
      const oldChannels = [...state.channels];
      setState((s) => ({
        ...s,
        channels: s.channels.map((c) =>
          c.id === channelId
            ? { ...c, position: newPosition, parent_id: newParentId }
            : c,
        ),
      }));

      try {
        await api.reorderDiscordChannel(channelId, {
          position: newPosition,
          parent_id: newParentId,
        });
        // Refresh to get verified order from server
        if (state.selectedGuildId) {
          await loadChannels(state.selectedGuildId);
        }
      } catch {
        // Rollback to old state
        setState((s) => ({ ...s, channels: oldChannels }));
        throw new Error("Reorder failed");
      }
    },
    [state.channels, state.selectedGuildId, loadChannels],
  );

  const handleRefresh = useCallback(() => {
    void loadGuilds();
    if (state.selectedGuildId) void loadChannels(state.selectedGuildId);
  }, [loadGuilds, loadChannels, state.selectedGuildId]);

  return (
    <div className="flex flex-col gap-4">
      <PluginSlot name="discord:top" />

      {/* Tab navigation */}
      <div className="flex gap-1 border-b border-current/10 pb-1">
        <button
          type="button"
          onClick={() => setActiveTab("channels")}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-none border-b-2 px-3 py-1.5 font-mondwest text-[0.65rem] tracking-[0.1em] uppercase transition-colors",
            activeTab === "channels"
              ? "border-accent text-accent"
              : "border-transparent text-muted-foreground/60 hover:text-muted-foreground",
          )}
        >
          <MessageSquare className="h-3 w-3" />
          Channels
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("roles")}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-none border-b-2 px-3 py-1.5 font-mondwest text-[0.65rem] tracking-[0.1em] uppercase transition-colors",
            activeTab === "roles"
              ? "border-accent text-accent"
              : "border-transparent text-muted-foreground/60 hover:text-muted-foreground",
          )}
        >
          <Shield className="h-3 w-3" />
          Roles
        </button>
      </div>

      {activeTab === "channels" && (
        <div className="max-w-3xl">
          <ChannelList
            guilds={state.guilds}
            selectedGuildId={state.selectedGuildId}
            channels={state.channels}
            channelsLoading={state.channelsLoading}
            guildsLoading={state.guildsLoading}
            onSelectGuild={handleSelectGuild}
            onRefresh={handleRefresh}
            onReorder={handleReorder}
          />
        </div>
      )}

      {activeTab === "roles" && (
        <div className="min-h-0 flex-1">
          <RolePanel />
        </div>
      )}

      <PluginSlot name="discord:bottom" />
    </div>
  );
}
