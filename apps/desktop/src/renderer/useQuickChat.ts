import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { QuickChat } from './quick-chat.js';

export function useQuickChat(profile: string, workspace: string) {
  const chat = useMemo(() => new QuickChat(window.lastbrowser.sidekick, { profile, workspace }), [profile, workspace]);
  useEffect(() => () => chat.dispose(), [chat]);
  const state = useSyncExternalStore(chat.subscribe, chat.getSnapshot);
  return { ...state, send: chat.send, stop: chat.stop, reset: chat.reset, setDraft: chat.setDraft };
}
