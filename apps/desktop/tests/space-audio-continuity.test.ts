import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

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

  it('keeps a hidden keepalive layer with one webview per pinned audio tab', () => {
    expect(app).toContain('audio-keepalive-layer');
    expect(app).toContain('key={`keepalive:${entry.tab.id}`}');
    // Media must stay active in the hidden guest.
    expect(app).toContain('backgroundThrottling=no');
  });

  it('merges pinned audio tabs into the keepalive list before leaving a space', () => {
    expect(app).toContain('const keepaliveCandidates = tabs');
    expect(app).toContain('.filter((tab) => tab.pinned && tab.isPlayingAudio)');
    expect(app).toContain('spacePath: activeSpacePath, profileId: activeProfileId');
  });

  it('drops keepalive entries for the target space so audio is never doubled', () => {
    expect(app).toContain("current.filter((entry) => entry.spacePath !== newSpacePath)");
  });

  it('never mutes keepalive webviews: they carry no data-tab-id marker', () => {
    // The mute path only touches webview[data-tab-id]; the keepalive webview
    // deliberately omits that attribute.
    const keepaliveStart = app.indexOf('audio-keepalive-layer');
    const keepaliveEnd = app.indexOf('</div>', keepaliveStart);
    const keepaliveBlock = app.slice(keepaliveStart, keepaliveEnd);
    expect(keepaliveBlock).toContain('<webview');
    expect(keepaliveBlock).not.toContain('data-tab-id');
  });

  it('removes keepalive entries when their space is deleted', () => {
    expect(app).toContain('setAudioKeepalive((current) => current.filter((entry) => entry.spacePath !== space.path))');
  });

  it('removes keepalive entries when switching to another profile', () => {
    expect(app).toContain('setAudioKeepalive((current) => current.filter((entry) => entry.profileId === profileId))');
  });

  it('reuses the same space partition so the media session survives the remount', () => {
    const keepaliveStart = app.indexOf('audio-keepalive-layer');
    const keepaliveEnd = app.indexOf('</div>', keepaliveStart);
    const keepaliveBlock = app.slice(keepaliveStart, keepaliveEnd);
    expect(keepaliveBlock).toContain('computeSpacePartition(entry.profileId, entry.spacePath, entry.tab.incognito, knownSpacePaths)');
  });
});