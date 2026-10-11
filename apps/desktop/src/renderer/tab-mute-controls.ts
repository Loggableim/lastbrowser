export interface TabMuteTarget {
  id: string;
  isMuted?: boolean;
}

export interface TabMuteControl {
  muted: boolean;
  onToggleMute: () => void;
}

export interface AudioMuteTarget {
  setAudioMuted: (muted: boolean) => void;
}

export function createTabMuteControl(
  activeTab: TabMuteTarget,
  toggleTabMute: (tabId: string) => void
): TabMuteControl {
  return {
    muted: Boolean(activeTab.isMuted),
    onToggleMute: () => toggleTabMute(activeTab.id)
  };
}

export function handleTabMuteShortcut(
  event: Pick<KeyboardEvent, 'ctrlKey' | 'metaKey' | 'key' | 'defaultPrevented' | 'preventDefault'>,
  onToggleMute: () => void
): boolean {
  if (event.defaultPrevented || !(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'm') return false;
  event.preventDefault();
  onToggleMute();
  return true;
}

export function syncTabMuteToWebview(view: AudioMuteTarget | null | undefined, isMuted: boolean | undefined): void {
  if (!view || typeof view.setAudioMuted !== 'function') return;
  try {
    view.setAudioMuted(Boolean(isMuted));
  } catch {
    // A guest can become unavailable while navigating.
  }
}
