import type { BrowserTab } from './tabs.js';

export interface SpaceAudioKeepaliveEntry {
  tab: BrowserTab;
  spacePath: string;
  profileId: string;
}

/** Attach one media-state pair to a WebView and return idempotent cleanup. */
export function subscribeToWebviewMediaState(
  view: EventTarget,
  tabId: string,
  onMediaPlaying: (tabId: string, isPlaying: boolean) => void
): () => void {
  const onStarted = () => onMediaPlaying(tabId, true);
  const onPaused = () => onMediaPlaying(tabId, false);
  view.addEventListener('media-started-playing', onStarted);
  view.addEventListener('media-paused', onPaused);
  let attached = true;
  return () => {
    if (!attached) return;
    attached = false;
    view.removeEventListener('media-started-playing', onStarted);
    view.removeEventListener('media-paused', onPaused);
  };
}

/**
 * Keeps the original BrowserMain tab node mounted while its Space is inactive.
 * A WebView partition preserves cookies/storage, but only retaining the same
 * keyed WebView element preserves the live guest and media session.
 */
export function mergeSpaceAudioTabs(
  activeTabs: BrowserTab[],
  keepalive: SpaceAudioKeepaliveEntry[],
  activeSpacePath: string,
  activeProfileId: string
): BrowserTab[] {
  const rendered = [...activeTabs];
  const ids = new Set(activeTabs.map((tab) => tab.id));
  for (const entry of keepalive) {
    if (entry.profileId !== activeProfileId || entry.spacePath === activeSpacePath) continue;
    if (!entry.tab.pinned || !entry.tab.isPlayingAudio || ids.has(entry.tab.id)) continue;
    rendered.push(entry.tab);
    ids.add(entry.tab.id);
  }
  return rendered;
}
