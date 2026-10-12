import { describe, expect, it } from 'vitest';
import { resolveChatHeaderStatus } from '../src/renderer/chat-header-status.js';

describe('chat header runtime status', () => {
  it('keeps missing observations explicitly unknown', () => {
    expect(resolveChatHeaderStatus(null)).toBe('unknown');
    expect(resolveChatHeaderStatus(undefined)).toBe('unknown');
  });

  it('reports ready only after the API health check is ready', () => {
    expect(resolveChatHeaderStatus({ sidekick: 'ready', webuiHealth: 'checking', webuiUrl: 'http://127.0.0.1' })).toBe('starting');
    expect(resolveChatHeaderStatus({ sidekick: 'ready', webuiHealth: 'ready', webuiUrl: 'http://127.0.0.1' })).toBe('ready');
  });

  it('distinguishes startup from observed unavailable runtime states', () => {
    expect(resolveChatHeaderStatus({ sidekick: 'starting' })).toBe('starting');
    expect(resolveChatHeaderStatus({ sidekick: 'error' })).toBe('unavailable');
    expect(resolveChatHeaderStatus({ sidekick: 'missing' })).toBe('unavailable');
    expect(resolveChatHeaderStatus({ sidekick: 'stopped' })).toBe('unavailable');
  });
});
