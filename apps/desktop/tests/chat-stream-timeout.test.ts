import { describe, expect, it } from 'vitest';
import {
  isNativeChatProgressEvent,
  isNativeChatStreamWaitExpired,
  NATIVE_CHAT_STREAM_IDLE_TIMEOUT_MS,
  NATIVE_CHAT_STREAM_MAX_DURATION_MS,
} from '../src/renderer/chat-stream-timeout.js';

describe('native chat stream wait bounds', () => {
  it('keeps a long-running turn alive when model reasoning makes progress beyond two minutes', () => {
    const startedAt = 0;
    const reasoningProgressAt = 126_000;
    const now = 290_000;

    expect(isNativeChatProgressEvent('reasoning')).toBe(true);
    expect(now - startedAt).toBeGreaterThan(120_000);
    expect(isNativeChatStreamWaitExpired(startedAt, reasoningProgressAt, now)).toBe(false);
  });

  it('times out a stream that has no meaningful progress for the idle window', () => {
    expect(isNativeChatStreamWaitExpired(0, 10_000, 10_000 + NATIVE_CHAT_STREAM_IDLE_TIMEOUT_MS)).toBe(true);
  });

  it('enforces a hard maximum even if progress events keep arriving', () => {
    const startedAt = 0;
    const now = NATIVE_CHAT_STREAM_MAX_DURATION_MS;
    const lastProgressAt = now - 1;

    expect(isNativeChatStreamWaitExpired(startedAt, lastProgressAt, now)).toBe(true);
  });

  it('counts model and orchestration updates as progress but ignores keepalive-like event names', () => {
    expect(isNativeChatProgressEvent('delta')).toBe(true);
    expect(isNativeChatProgressEvent('teamwork_stage')).toBe(true);
    expect(isNativeChatProgressEvent('smart_track_step')).toBe(true);
    expect(isNativeChatProgressEvent('ping')).toBe(false);
    expect(isNativeChatProgressEvent('heartbeat')).toBe(false);
  });
});
