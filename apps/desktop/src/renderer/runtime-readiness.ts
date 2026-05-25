export type RuntimeStatusLike = {
  sidekick?: string;
  webuiHealth?: string;
  webuiUrl?: string;
  port?: number | null;
  lastError?: string | null;
} | null | undefined;

export function canCallSidekickApi(status: RuntimeStatusLike): boolean {
  return status?.sidekick === 'ready' && Boolean(status.webuiUrl);
}

export function serviceReadinessLabel(status: RuntimeStatusLike): string {
  if (canCallSidekickApi(status)) return 'Sidekick online';
  if (status?.sidekick === 'ready') return 'Sidekick API starting';
  if (status?.lastError) return 'Sidekick error';
  return 'Sidekick starting';
}
