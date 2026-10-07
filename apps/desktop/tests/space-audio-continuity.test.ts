import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { mergeSpaceAudioTabs, subscribeToWebviewMediaState, type SpaceAudioKeepaliveEntry } from '../src/renderer/space-audio-keepalive.js';
import type { BrowserTab } from '../src/renderer/tabs.js';

const rendererDir = resolve(__dirname, '../src/renderer');

function readRendererFile(fileName: string): string {
  return readFileSync(resolve(rendererDir, fileName), 'utf8');
}

describe('space audio continuity', () => {
  it('handleSpaceSelect exempts pinned audio tabs from muting instead of blanket-muting all webviews', () => {
    const source = readRendererFile('App.tsx');

    // The old blanket mute must be gone from the space-switch path.
    expect(source).not.toContain("document.querySelectorAll('webview')");
    // Per-tab exemption logic must exist.
    expect(source).toContain('tab.pinned && tab.isPlayingAudio');
  });

  it('vertical tab items expose a pin button wired to onPinTab', () => {
    const source = readRendererFile('components/SidekickSidebar.tsx');

    expect(source).toContain('onPinTab?.(');
    expect(source).toContain('vertical-tab-pin-btn');
    // Pinned tabs must remain reachable from the modern sidebar after pinning.
    expect(source).toContain('<span className="tab-count-badge">{tabs.length}</span>');
    expect(source).toContain('{tabs.map((tab) => {');
    expect(source).not.toContain('tabs.filter((t) => !t.pinned).map((tab) => {');
  });

  it('styles the pin button including its pinned state', () => {
    const css = readRendererFile('styles.css');

    expect(css).toContain('.vertical-tab-pin-btn');
  });

  it('keeps discard protection for pinned and audio tabs', () => {
    const tabs = readRendererFile('tabs.ts');

    expect(tabs).toContain('tab.pinned || tab.isPlayingAudio');
  });
});

describe('audio keepalive across spaces (goal.md Paket 3)', () => {
  const app = readRendererFile('App.tsx').replace(/\r\n/g, '\n');

  it('keeps the original keyed WebView in BrowserMain instead of reloading its URL', () => {
    expect(app).toContain('audioKeepalive={audioKeepalive}');
    expect(app).toContain('mergeSpaceAudioTabs(activeTabs, audioKeepalive, activeSpacePath, activeProfile.id)');
    expect(app).toContain('key={`${computeSpacePartition(');
    expect(app).not.toContain('audio-keepalive-layer');
    expect(app).not.toContain('key={`keepalive:${entry.tab.id}`}');
    expect(app).not.toContain('src={entry.tab.url}');
  });

  it('merges pinned audio tabs into the keepalive list before leaving a space', () => {
    expect(app).toContain('const keepaliveCandidates = tabs');
    expect(app).toContain('.filter((tab) => tab.pinned && tab.isPlayingAudio)');
    expect(app).toContain('spacePath: activeSpacePath, profileId: activeProfileId');
  });

  it('drops keepalive entries for the target space so audio is never doubled', () => {
    expect(app).toContain("current.filter((entry) => entry.spacePath !== newSpacePath)");
  });

  it('exempts prior-space keepalive tabs from later space-switch muting', () => {
    expect(app).toContain("...audioKeepalive\n          .filter((entry) => entry.profileId === activeProfileId && entry.tab.pinned && entry.tab.isPlayingAudio)");
  });

  it('removes keepalive entries when their space is deleted', () => {
    expect(app).toContain('setAudioKeepalive((current) => current.filter((entry) => entry.spacePath !== space.path))');
  });

  it('removes keepalive entries when switching to another profile', () => {
    expect(app).toContain('setAudioKeepalive((current) => current.filter((entry) => entry.profileId === profileId))');
  });

  it('passes the original guest the source Space partition while it is kept alive', () => {
    expect(app).toContain('keepaliveEntry?.profileId ?? activeProfile.id');
    expect(app).toContain('keepaliveEntry?.spacePath ?? activeSpacePath');
    expect(app).toContain('right: 0, bottom: 0, width: 1, height: 1, opacity: 0');
  });

  it('subscribes and cleans up media listeners on every rendered WebView ref', () => {
    expect(app).toContain('webviewMediaCleanupRefs.current[tabId] = subscribeToWebviewMediaState(');
    expect(app).toContain('onWebviewMediaPlayingRef.current?.(id, isPlaying)');
    expect(app).not.toContain("view.addEventListener('media-started-playing', onMediaStarted)");
    expect(app).not.toContain("view.addEventListener('media-paused', onMediaPaused)");
    expect(app).toContain('webviewMediaCleanupRefs.current[tabId]?.();');
  });
});

describe('mergeSpaceAudioTabs', () => {
  const playingTab: BrowserTab = {
    id: 'audio-tab-a', title: 'Music', url: 'https://example.test/music', pinned: true, isPlayingAudio: true
  };
  const entry: SpaceAudioKeepaliveEntry = { tab: playingTab, spacePath: 'space-a', profileId: 'profile-1' };

  it('retains the exact tab record once when its Space becomes inactive', () => {
    const result = mergeSpaceAudioTabs([], [entry], 'space-b', 'profile-1');
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(playingTab);
  });

  it('does not duplicate a tab already in the active Space or keep tabs across profiles', () => {
    expect(mergeSpaceAudioTabs([playingTab], [entry], 'space-b', 'profile-1')).toEqual([playingTab]);
    expect(mergeSpaceAudioTabs([], [entry], 'space-b', 'profile-2')).toEqual([]);
    expect(mergeSpaceAudioTabs([], [entry], 'space-a', 'profile-1')).toEqual([]);
  });

  it('only retains pinned tabs still known to be playing audio', () => {
    const unpinned = { ...playingTab, pinned: false };
    const stopped = { ...playingTab, isPlayingAudio: false };
    expect(mergeSpaceAudioTabs([], [{ ...entry, tab: unpinned }], 'space-b', 'profile-1')).toEqual([]);
    expect(mergeSpaceAudioTabs([], [{ ...entry, tab: stopped }], 'space-b', 'profile-1')).toEqual([]);
  });
});

describe('subscribeToWebviewMediaState', () => {
  it('updates the associated tab on start/pause and removes listeners idempotently', () => {
    const view = new EventTarget();
    const changes: Array<[string, boolean]> = [];
    const cleanup = subscribeToWebviewMediaState(view, 'tab-audio', (tabId, isPlaying) => {
      changes.push([tabId, isPlaying]);
    });

    view.dispatchEvent(new Event('media-started-playing'));
    view.dispatchEvent(new Event('media-paused'));
    expect(changes).toEqual([['tab-audio', true], ['tab-audio', false]]);

    cleanup();
    cleanup();
    view.dispatchEvent(new Event('media-started-playing'));
    expect(changes).toEqual([['tab-audio', true], ['tab-audio', false]]);
  });
});
