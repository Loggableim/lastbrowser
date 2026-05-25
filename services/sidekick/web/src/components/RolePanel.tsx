import { useEffect, useMemo, useState } from "react";
import { RefreshCw, ShieldAlert, Users } from "lucide-react";
import { Spinner } from "@nous-research/ui/ui/components/spinner";
import { Button } from "@nous-research/ui/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Toast } from "@/components/Toast";
import { Typography } from "@/components/NouiTypography";
import { useToast } from "@/hooks/useToast";
import { api } from "@/lib/api";
import type { DiscordMember, DiscordRole } from "@/lib/api";
import { RoleDropZone } from "@/components/RoleDropZone";
import { cn } from "@/lib/utils";

/**
 * Role management panel — displays guild roles with their members and
 * supports drag-and-drop assignment of members between roles.
 *
 * Data flow:
 * 1. On mount, fetches `GET /api/discord/guilds/:guildId/roles`
 *    and `GET /api/discord/guilds/:guildId/members`
 * 2. Members are grouped by their `role_ids` array
 * 3. Dragging a member from role A to role B triggers
 *    `PUT /api/discord/members/:memberId/roles` with add/remove IDs
 * 4. On success: optimistic update keeps the new layout
 *    On error: rollback + toast
 */
export function RolePanel() {
  const [guildId, setGuildId] = useState<string>("mock");
  const [roles, setRoles] = useState<DiscordRole[]>([]);
  const [members, setMembers] = useState<DiscordMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null); // memberId being saved
  const { toast, showToast } = useToast(4000);

  // ── Data loading ──────────────────────────────────────────────────────

  const loadData = async (gid: string) => {
    setLoading(true);
    setError(null);
    try {
      const [rolesRes, membersRes] = await Promise.all([
        api.getDiscordRoles(gid),
        api.getDiscordMembers(gid, 200),
      ]);
      setRoles(rolesRes.roles);
      setMembers(membersRes.members);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to load guild data";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData(guildId);
  }, [guildId]);

  // ── Group members by role ─────────────────────────────────────────────

  const membersByRole = useMemo(() => {
    const map = new Map<string, DiscordMember[]>();
    for (const role of roles) {
      map.set(
        role.id,
        members.filter((m) => m.role_ids.includes(role.id)),
      );
    }
    return map;
  }, [roles, members]);

  const unmanagedMembers = useMemo(
    () => members.filter((m) => m.role_ids.length === 0),
    [members],
  );

  // ── Drag & drop handler ───────────────────────────────────────────────

  const handleDropMember = async (
    draggedMember: DiscordMember,
    targetRole: DiscordRole,
  ) => {
    // Optimistic update: add target role, remove all other roles
    const oldRoleIds = [...draggedMember.role_ids];

    // Mutation: set role to only the target role
    const newRoleIds = [targetRole.id];

    // Update local state optimistically
    setMembers((prev) =>
      prev.map((m) =>
        m.id === draggedMember.id ? { ...m, role_ids: newRoleIds } : m,
      ),
    );

    setSaving(draggedMember.id);

    try {
      const res = await api.setDiscordMemberRoles(draggedMember.id, {
        guild_id: guildId,
        add_role_ids: [targetRole.id],
        remove_role_ids: oldRoleIds.filter((id) => id !== targetRole.id),
      });

      if (res.ok) {
        showToast(
          `${draggedMember.display_name} → ${targetRole.name}`,
          "success",
        );
      } else {
        throw new Error("API returned ok: false");
      }
    } catch (err) {
      // Rollback
      setMembers((prev) =>
        prev.map((m) =>
          m.id === draggedMember.id ? { ...m, role_ids: oldRoleIds } : m,
        ),
      );
      showToast(
        `Failed to assign ${draggedMember.display_name}: ${
          err instanceof Error ? err.message : "Unknown error"
        }`,
        "error",
      );
    } finally {
      setSaving(null);
    }
  };

  // ── Sort roles by position ────────────────────────────────────────────

  const sortedRoles = useMemo(
    () => [...roles].sort((a, b) => a.position - b.position),
    [roles],
  );

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4">
      <Toast toast={toast} />

      {/* Header */}
      <Card className="flex flex-col gap-3 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-midground" aria-hidden />
            <Typography
              mondwest
              className="text-xs uppercase tracking-wider text-midground"
            >
              Role Management
            </Typography>
          </div>

          <Button
            ghost
            size="icon"
            className="h-7 w-7"
            onClick={() => loadData(guildId)}
            disabled={loading}
            aria-label="Refresh roles"
          >
            <RefreshCw
              className={cn("h-3.5 w-3.5", loading && "animate-spin")}
            />
          </Button>
        </div>

        <div className="flex items-center gap-2 text-[0.6rem] uppercase tracking-wider text-muted-foreground/60">
          <span>{members.length} members</span>
          <span aria-hidden>&middot;</span>
          <span>{roles.length} roles</span>
          {saving && (
            <>
              <span aria-hidden>&middot;</span>
              <span className="text-accent/70">saving&hellip;</span>
            </>
          )}
        </div>
      </Card>

      {/* Loading state */}
      {loading && (
        <div className="flex min-h-0 min-w-0 flex-1 items-center justify-center">
          <Spinner />
        </div>
      )}

      {/* Error state */}
      {!loading && error && (
        <div className="flex min-h-0 min-w-0 flex-1 items-center justify-center">
          <Card className="flex flex-col items-center gap-3 px-8 py-6 text-center">
            <ShieldAlert className="h-8 w-8 text-destructive/60" />
            <Typography
              mondwest
              className="text-xs uppercase tracking-wider text-muted-foreground"
            >
              Failed to load roles
            </Typography>
            <p className="max-w-sm text-xs text-muted-foreground/60">
              {error}
            </p>
            <Button
              ghost
              className="mt-2 text-xs"
              onClick={() => loadData(guildId)}
            >
              Retry
            </Button>
          </Card>
        </div>
      )}

      {/* Role cards */}
      {!loading && !error && (
        <div className="flex min-h-0 flex-1 flex-col gap-4">
          {/* Empty state */}
          {sortedRoles.length === 0 && (
            <div className="flex min-h-0 flex-1 items-center justify-center">
              <Card className="flex flex-col items-center gap-3 px-8 py-6 text-center">
                <Users className="h-8 w-8 text-muted-foreground/40" />
                <Typography
                  mondwest
                  className="text-xs uppercase tracking-wider text-muted-foreground"
                >
                  No roles found
                </Typography>
                <p className="max-w-sm text-xs text-muted-foreground/60">
                  This guild has no roles configured yet.
                </p>
              </Card>
            </div>
          )}

          {/* Role cards grid */}
          {sortedRoles.length > 0 && (
            <div className="flex flex-wrap gap-3">
              {sortedRoles.map((role) => (
                <RoleDropZone
                  key={role.id}
                  role={role}
                  members={membersByRole.get(role.id) ?? []}
                  onDropMember={handleDropMember}
                  compact
                />
              ))}
            </div>
          )}

          {/* Unmanaged members section */}
          {unmanagedMembers.length > 0 && (
            <Card className="mt-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-3.5 w-3.5" aria-hidden />
                  Unassigned ({unmanagedMembers.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-1">
                  {unmanagedMembers.map((member) => (
                    <span
                      key={member.id}
                      className="inline-flex items-center gap-1.5 rounded bg-midground/5 px-2 py-1 text-xs text-muted-foreground/80"
                    >
                      {member.display_name || member.username}
                    </span>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
