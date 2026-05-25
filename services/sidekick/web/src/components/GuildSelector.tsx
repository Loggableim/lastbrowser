import { Server } from "lucide-react";
import { Select, SelectOption } from "@nous-research/ui/ui/components/select";
import { Spinner } from "@nous-research/ui/ui/components/spinner";
import type { DiscordGuild } from "@/lib/api";

interface GuildSelectorProps {
  guilds: DiscordGuild[];
  selectedGuildId: string | null;
  onSelect: (guildId: string) => void;
  loading: boolean;
}

export function GuildSelector({
  guilds,
  selectedGuildId,
  onSelect,
  loading,
}: GuildSelectorProps) {
  return (
    <div className="flex items-center gap-3">
      <Server className="h-4 w-4 shrink-0 text-midground/70" />
      <div className="min-w-0 flex-1">
        <Select
          value={selectedGuildId ?? ""}
          onValueChange={(v) => onSelect(v)}
          disabled={loading || guilds.length === 0}
          placeholder={
            loading
              ? "Loading servers..."
              : guilds.length === 0
                ? "No Discord servers available"
                : "Select a Discord server"
          }
        >
          {guilds.map((g) => (
            <SelectOption key={g.id} value={g.id}>
              {g.icon_url ? (
                <img
                  src={g.icon_url}
                  alt=""
                  className="mr-2 inline-block h-4 w-4 rounded-full"
                />
              ) : null}
              {g.name}
              <span className="ml-2 text-[0.6rem] opacity-50">
                {g.channel_count} ch · {g.member_count} members
              </span>
            </SelectOption>
          ))}
        </Select>
      </div>
      {loading && <Spinner className="shrink-0" />}
    </div>
  );
}
