import { useSyncExternalStore } from 'react';

export const BUILTIN_SKILLS_STORAGE_KEY = 'lastbrowser.mcp_skills.v1';
export const BUILTIN_SKILLS_CHANGED_EVENT = 'lastbrowser:builtin-skills-changed';

/** Missing preferences keep the optional terminal off; preserve a saved opt-in. */
export function readTerminalEnabled(): boolean {
  try {
    const stored: unknown = JSON.parse(window.localStorage.getItem(BUILTIN_SKILLS_STORAGE_KEY) || 'null');
    return Array.isArray(stored) && stored.some(item => item && typeof item === 'object'
      && item.id === 'mcp-terminal' && item.type === 'builtin' && item.enabled === true);
  } catch { return false; }
}
function subscribe(listener: () => void): () => void {
  const storageChanged = (event: StorageEvent) => { if (!event.key || event.key === BUILTIN_SKILLS_STORAGE_KEY) listener(); };
  window.addEventListener(BUILTIN_SKILLS_CHANGED_EVENT, listener);
  window.addEventListener('storage', storageChanged);
  return () => { window.removeEventListener(BUILTIN_SKILLS_CHANGED_EVENT, listener); window.removeEventListener('storage', storageChanged); };
}
export function useTerminalEnabled(): boolean { return useSyncExternalStore(subscribe, readTerminalEnabled, () => false); }
