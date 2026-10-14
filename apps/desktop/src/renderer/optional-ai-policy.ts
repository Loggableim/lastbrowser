import { createContext, useContext, useEffect, useRef, useState } from 'react';

export type OptionalAiPolicy = {
  enabled: boolean;
  cloud_search_enabled: boolean;
  assistants_enabled: boolean;
  gmail_ai_enabled: boolean;
  discord_agents_enabled: boolean;
  kanban_enabled: boolean;
  tasks_enabled: boolean;
  scope: 'profile' | 'space';
  supported_scopes: string[];
};
const changedEvent = 'lastbrowser:optional-ai-policy-changed';
export const OptionalAiProfileContext = createContext<string | null>(null);
export const OptionalAiWorkspaceContext = createContext<string | null>(null);
const defaults: OptionalAiPolicy = { enabled: false, cloud_search_enabled: false, assistants_enabled: false, gmail_ai_enabled: false, discord_agents_enabled: false, kanban_enabled: false, tasks_enabled: false, scope: 'profile', supported_scopes: ['profile'] };

export function useOptionalAiPolicy(scopeKey = '') {
  const profile = useContext(OptionalAiProfileContext);
  scopeKey = `${profile || ''}::${scopeKey}`;
  const [policy, setPolicy] = useState(defaults);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const generation = useRef(0);
  const refreshSequence = useRef(0);
  const currentScope = useRef(scopeKey);
  currentScope.current = scopeKey;
  const [loadedScope, setLoadedScope] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    const lifecycle = ++generation.current;
    setPolicy(defaults); setLoaded(false); setLoadedScope(null); setError(''); setBusy(false);
    if (!profile) return;
    const refresh = async () => {
      const sequence = ++refreshSequence.current;
      try {
        const value = await window.lastbrowser.sidekick.getMemoryPolicy({ profile });
        if (value.ok === false || value.error) throw new Error(String(value.error || 'Policy unavailable'));
        if (alive && sequence === refreshSequence.current && lifecycle === generation.current && currentScope.current === scopeKey) {
          setPolicy({ ...defaults, ...value } as OptionalAiPolicy); setLoaded(true); setLoadedScope(scopeKey); setError('');
        }
      } catch (reason) { if (alive && sequence === refreshSequence.current && lifecycle === generation.current && currentScope.current === scopeKey) { setLoaded(false); setLoadedScope(scopeKey); setPolicy(defaults); setError(reason instanceof Error ? reason.message : String(reason)); } }
    };
    void refresh();
    window.addEventListener(changedEvent, refresh);
    window.addEventListener('focus', refresh);
    return () => { alive = false; generation.current++; window.removeEventListener(changedEvent, refresh); window.removeEventListener('focus', refresh); };
  }, [scopeKey, profile]);
  const update = async (patch: Partial<OptionalAiPolicy>) => {
    if (!profile || !loaded || busy || loadedScope !== scopeKey) return;
    const lifecycle = generation.current;
    ++refreshSequence.current;
    setBusy(true); setError('');
    try {
      const value = await window.lastbrowser.sidekick.setMemoryPolicy({ ...patch, profile });
      if (lifecycle !== generation.current || currentScope.current !== scopeKey) return;
      if (value.ok === false || value.error) throw new Error(String(value.error || 'Policy could not be saved'));
      setPolicy({ ...defaults, ...value } as OptionalAiPolicy);
      window.dispatchEvent(new Event(changedEvent));
    } catch (reason) { if (lifecycle === generation.current && currentScope.current === scopeKey) setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { if (lifecycle === generation.current && currentScope.current === scopeKey) setBusy(false); }
  };
  const matchesScope = loadedScope === scopeKey;
  return { policy: matchesScope ? policy : defaults, loaded: matchesScope && loaded, busy: matchesScope && busy, error: matchesScope ? error : '', update };
}
