import { describe, expect, it, vi } from 'vitest';
import {
  createAdblockController,
  isStreamingUrl,
  isStreamingRequest,
  patchBlockerForStreaming
} from '../src/main/adblock.js';

type Listener = (...args: unknown[]) => void;

function fakeBlocker() {
  const listeners = new Map<string, Listener[]>();
  const enabled = new Set<unknown>();
  return {
    on: vi.fn((event: string, listener: Listener) => {
      const current = listeners.get(event) || [];
      current.push(listener);
      listeners.set(event, current);
    }),
    enableBlockingInSession: vi.fn((session: unknown) => {
      enabled.add(session);
    }),
    disableBlockingInSession: vi.fn((session: unknown) => {
      enabled.delete(session);
    }),
    emit(event: string, ...args: unknown[]) {
      for (const listener of listeners.get(event) || []) listener(...args);
    },
    enabledSessions: enabled
  };
}

const fakeSession = () => ({ id: `session-${Math.random()}` }) as never;

describe('adblock controller', () => {
  it('starts in idle state and reports enabled by default', () => {
    const controller = createAdblockController({ loadBlocker: async () => fakeBlocker() as never });
    const status = controller.getStatus();
    expect(status.state).toBe('idle');
    expect(status.enabled).toBe(true);
    expect(status.blockedCount).toBe(0);
    expect(status.lastError).toBeNull();
  });

  it('loads the blocker and attaches it to a session', async () => {
    const blocker = fakeBlocker();
    const controller = createAdblockController({ loadBlocker: async () => blocker as never });
    const session = fakeSession();

    await controller.attach(session);

    expect(blocker.enableBlockingInSession).toHaveBeenCalledTimes(1);
    expect(controller.getStatus().state).toBe('ready');
  });

  it('is idempotent per session', async () => {
    const blocker = fakeBlocker();
    const controller = createAdblockController({ loadBlocker: async () => blocker as never });
    const session = fakeSession();

    await controller.attach(session);
    await controller.attach(session);
    await controller.attach(session);

    expect(blocker.enableBlockingInSession).toHaveBeenCalledTimes(1);
  });

  it('attaches separate sessions independently', async () => {
    const blocker = fakeBlocker();
    const controller = createAdblockController({ loadBlocker: async () => blocker as never });

    await controller.attach(fakeSession());
    await controller.attach(fakeSession());

    expect(blocker.enableBlockingInSession).toHaveBeenCalledTimes(2);
  });

  it('counts blocked requests', async () => {
    const blocker = fakeBlocker();
    const controller = createAdblockController({ loadBlocker: async () => blocker as never });
    await controller.attach(fakeSession());

    blocker.emit('request-blocked');
    blocker.emit('request-blocked');
    blocker.emit('request-blocked');

    expect(controller.getStatus().blockedCount).toBe(3);
  });

  it('does not count other events', async () => {
    const blocker = fakeBlocker();
    const controller = createAdblockController({ loadBlocker: async () => blocker as never });
    await controller.attach(fakeSession());

    blocker.emit('request-allowed');
    blocker.emit('request-whitelisted');

    expect(controller.getStatus().blockedCount).toBe(0);
  });

  it('captures load failures instead of throwing', async () => {
    const controller = createAdblockController({
      loadBlocker: async () => {
        throw new Error('network down');
      }
    });

    await expect(controller.attach(fakeSession())).resolves.toBeUndefined();

    const status = controller.getStatus();
    expect(status.state).toBe('error');
    expect(status.lastError).toBe('network down');
  });

  it('does not enable blocking when disabled at construction', async () => {
    const blocker = fakeBlocker();
    const controller = createAdblockController({
      enabled: false,
      loadBlocker: async () => blocker as never
    });

    await controller.attach(fakeSession());

    expect(blocker.enableBlockingInSession).not.toHaveBeenCalled();
    expect(controller.isEnabled()).toBe(false);
  });

  it('toggles blocking on attached sessions', async () => {
    const blocker = fakeBlocker();
    const controller = createAdblockController({ loadBlocker: async () => blocker as never });
    const session = fakeSession();
    await controller.attach(session);

    controller.setEnabled(false);
    expect(blocker.disableBlockingInSession).toHaveBeenCalledWith(session);
    expect(controller.isEnabled()).toBe(false);

    controller.setEnabled(true);
    expect(blocker.enableBlockingInSession).toHaveBeenCalledTimes(2);
    expect(controller.isEnabled()).toBe(true);
  });

  it('ignores redundant enable toggles', async () => {
    const blocker = fakeBlocker();
    const controller = createAdblockController({ loadBlocker: async () => blocker as never });
    await controller.attach(fakeSession());

    controller.setEnabled(true);
    controller.setEnabled(true);

    expect(blocker.enableBlockingInSession).toHaveBeenCalledTimes(1);
  });

  it('survives a session that throws on enable', async () => {
    const blocker = fakeBlocker();
    blocker.enableBlockingInSession.mockImplementation(() => {
      throw new Error('session destroyed');
    });
    const controller = createAdblockController({ loadBlocker: async () => blocker as never });

    await expect(controller.attach(fakeSession())).resolves.toBeUndefined();
    expect(controller.getStatus().state).toBe('error');
  });

  describe('streaming DRM and telemetry whitelist bypass (Netflix NSES-UHX fix)', () => {
    it('correctly identifies Netflix, Disney+ and Spotify streaming URLs', () => {
      expect(isStreamingUrl('https://www.netflix.com/watch/80186931')).toBe(true);
      expect(isStreamingUrl('https://ichnaea.netflix.com/log')).toBe(true);
      expect(isStreamingUrl('https://customerevents.netflix.com/events')).toBe(true);
      expect(isStreamingUrl('https://occ-0-123.1.nflxso.net/video/chunk.m4s')).toBe(true);
      expect(isStreamingUrl('https://assets.nflxext.com/player.js')).toBe(true);
      expect(isStreamingUrl('https://www.disneyplus.com/home')).toBe(true);
      expect(isStreamingUrl('https://media.dssott.com/stream.mpd')).toBe(true);
      expect(isStreamingUrl('https://bamgrid.com/api/v1/auth')).toBe(true);
      expect(isStreamingUrl('https://open.spotify.com/track/123')).toBe(true);

      // Normal websites must not be bypassed
      expect(isStreamingUrl('https://www.google.com/search?q=test')).toBe(false);
      expect(isStreamingUrl('https://www.spiegel.de/')).toBe(false);
      expect(isStreamingUrl('https://github.com/Loggableim/lastbrowser')).toBe(false);
      expect(isStreamingUrl('')).toBe(false);
      expect(isStreamingUrl(undefined)).toBe(false);
    });

    it('identifies streaming requests by target URL, initiator or referrer', () => {
      expect(isStreamingRequest({ url: 'https://ichnaea.netflix.com/log' })).toBe(true);
      expect(isStreamingRequest({ url: 'https://cdn.example.com/asset.js', initiator: 'https://www.netflix.com' })).toBe(true);
      expect(isStreamingRequest({ url: 'https://cdn.example.com/asset.js', referrer: 'https://www.disneyplus.com/' })).toBe(true);
      expect(isStreamingRequest({ url: 'https://ads.doubleclick.net/ad', initiator: 'https://news.com' })).toBe(false);
    });

    it('patches ElectronBlocker to bypass streaming requests without blocking', () => {
      const mockOrigOnBeforeRequest = vi.fn((_details, callback) => callback({ cancel: true }));
      const mockOrigOnHeadersReceived = vi.fn((_details, callback) => callback({ responseHeaders: {} }));
      const mockOrigOnInject = vi.fn().mockResolvedValue(undefined);

      const mockBlocker = {
        onBeforeRequest: mockOrigOnBeforeRequest,
        onHeadersReceived: mockOrigOnHeadersReceived,
        onInjectCosmeticFilters: mockOrigOnInject
      };

      patchBlockerForStreaming(mockBlocker);

      // 1. Streaming request should NOT be passed to blocker and must not be cancelled
      const netflixCallback = vi.fn();
      mockBlocker.onBeforeRequest({ url: 'https://ichnaea.netflix.com/log' }, netflixCallback);
      expect(netflixCallback).toHaveBeenCalledWith({});
      expect(mockOrigOnBeforeRequest).not.toHaveBeenCalled();

      // 2. Normal ad request should still be passed to blocker
      const adCallback = vi.fn();
      mockBlocker.onBeforeRequest({ url: 'https://adservice.google.com/ads' }, adCallback);
      expect(mockOrigOnBeforeRequest).toHaveBeenCalledTimes(1);

      // 3. Streaming headers should not be modified
      const netflixHeadersCallback = vi.fn();
      mockBlocker.onHeadersReceived({ url: 'https://www.netflix.com' }, netflixHeadersCallback);
      expect(netflixHeadersCallback).toHaveBeenCalledWith({});
      expect(mockOrigOnHeadersReceived).not.toHaveBeenCalled();

      // 4. Cosmetic filter injection should be skipped for streaming URLs
      mockBlocker.onInjectCosmeticFilters({}, 'https://www.netflix.com/browse');
      expect(mockOrigOnInject).not.toHaveBeenCalled();
    });
  });
});
