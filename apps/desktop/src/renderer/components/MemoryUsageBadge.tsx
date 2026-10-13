import React, { useContext, useEffect, useRef, useState } from 'react';
import { OptionalAiProfileContext, OptionalAiWorkspaceContext } from '../optional-ai-policy.js';
import { normalizeMemoryUsage, type MemoryUsageSource } from '../memory-usage.js';
import { useDesktopI18n } from '../i18n.js';
import './memory-usage-badge.css';

export function MemoryUsageBadge({ value }: { value: unknown }): React.JSX.Element | null {
  const profile = useContext(OptionalAiProfileContext);
  const workspacePath = useContext(OptionalAiWorkspaceContext);
  const { locale } = useDesktopI18n();
  const usage = normalizeMemoryUsage(value);
  const [preview, setPreview] = useState<{ scope: string; title: string; content: string; snapshot: boolean } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const generation = useRef(0);
  const scope = `${profile || ''}::${workspacePath || ''}`;
  const currentScope = useRef(scope);
  currentScope.current = scope;
  useEffect(() => { generation.current++; setPreview(null); setError(''); setBusy(false); return () => { generation.current++; }; }, [scope, value]);
  if (!usage) return null;
  const de = locale === 'de';
  async function openSource(source: MemoryUsageSource) {
    if (!profile || !workspacePath || busy) return;
    const request = ++generation.current;
    setBusy(true); setPreview(null); setError('');
    try {
      if (source.source !== 'document') {
        if (typeof source.excerpt !== 'string') throw new Error(de ? 'Für diese ältere Antwort ist kein Kontextauszug gespeichert.' : 'No context excerpt was saved for this older response.');
        setPreview({ scope, title: source.title, content: source.excerpt, snapshot: true });
        return;
      }
      const payload = await window.lastbrowser.sidekick.getSupermemoryDocument({ id: source.id, profile, workspacePath });
      if (request !== generation.current || currentScope.current !== scope) return;
      if (payload.ok === false || payload.error) throw new Error(String(payload.error || 'Source unavailable'));
      const document = payload.document;
      const content = document && typeof document === 'object'
        ? (document as Record<string, unknown>).content
        : undefined;
      if (typeof content !== 'string') throw new Error(de ? 'Quelle wurde entfernt oder ist nicht verfügbar.' : 'Source was removed or is unavailable.');
      setPreview({ scope, title: source.title, content, snapshot: false });
    } catch (reason) { if (request === generation.current && currentScope.current === scope) setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { if (request === generation.current && currentScope.current === scope) setBusy(false); }
  }
  return <details className="chat-memory-usage">
    <summary>{de ? `${usage.sources.length} Erinnerung${usage.sources.length === 1 ? '' : 'en'} als Kontext` : `${usage.sources.length} memor${usage.sources.length === 1 ? 'y' : 'ies'} supplied as context`}</summary>
    <p>{de ? 'Diese Quellen wurden für diese Antwort bereitgestellt. Notizen zeigen den damaligen Kontextauszug; Dokumente den aktuell gespeicherten Inhalt.' : 'These sources were supplied for this response. Notes show the captured context excerpt; documents show the currently saved content.'}</p>
    <ul>{usage.sources.map(source => <li key={`${source.source}:${source.id}`}><button type="button" disabled={!profile || !workspacePath || busy} onClick={() => void openSource(source)}>{source.title}</button></li>)}</ul>
    {busy && <p role="status">{de ? 'Quelle wird geladen …' : 'Loading source …'}</p>}
    {error && <p role="alert">{error}</p>}
    {preview && preview.scope === scope && <section><strong>{preview.title}</strong><p>{preview.snapshot ? (de ? 'Kontextauszug dieser Antwort' : 'Context excerpt for this response') : (de ? 'Aktuell gespeichertes Dokument' : 'Currently saved document')}</p><pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', maxHeight: 260, overflow: 'auto' }}>{preview.content}</pre></section>}
  </details>;
}
