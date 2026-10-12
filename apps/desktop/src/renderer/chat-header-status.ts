import { canCallSidekickApi, type RuntimeStatusLike } from './runtime-readiness.js';

export type ChatHeaderStatus = 'unknown' | 'ready' | 'starting' | 'unavailable';

export function resolveChatHeaderStatus(status: RuntimeStatusLike): ChatHeaderStatus {
  if (status == null) return 'unknown';
  if (canCallSidekickApi(status)) return 'ready';
  if (status.sidekick === 'error' || status.sidekick === 'missing' || status.sidekick === 'stopped') return 'unavailable';
  return 'starting';
}
