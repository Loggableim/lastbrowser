export type RuntimeStatusLike = {
  sidekick?: string;
  webuiHealth?: string;
  webuiUrl?: string;
  port?: number | null;
  lastError?: string | null;
} | null | undefined;

export function canCallSidekickApi(status: RuntimeStatusLike): boolean {
  // The child process can spawn before Uvicorn has bound its port. Do not
  // expose API actions until the health loop has observed a successful HTTP
  // response; otherwise early settings/provider requests fail with ECONNREFUSED.
  return status?.sidekick === 'ready'
    && status.webuiHealth === 'ready'
    && Boolean(status.webuiUrl);
}

export function serviceReadinessLabel(status: RuntimeStatusLike): string {
  if (canCallSidekickApi(status)) return 'Sidekick online';
  if (status?.sidekick === 'ready' || status?.webuiHealth === 'checking') return 'Sidekick API starting';
  if (status?.lastError) return 'Sidekick error';
  return 'Sidekick starting';
}
