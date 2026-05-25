import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Play, ShieldAlert } from 'lucide-react';
import type { LastbrowserPanelId } from '../shell-state.js';
import { endpointGroupsForPanel } from '../webui-endpoints.js';
import type { WebuiEndpointAction } from '../webui-endpoints.js';

type ServiceStatus = Awaited<ReturnType<typeof window.lastbrowser.services.status>>;

function stringifyTemplate(value: unknown): string {
  return JSON.stringify(value || {}, null, 2);
}

function parseJsonObject(value: string): Record<string, unknown> {
  if (!value.trim()) return {};
  const parsed = JSON.parse(value) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Use a JSON object.');
  }
  return parsed as Record<string, unknown>;
}

export function AdvancedWebUiTools({
  compact = false,
  panel,
  serviceStatus
}: {
  compact?: boolean;
  panel: LastbrowserPanelId;
  serviceStatus: ServiceStatus | null;
}): JSX.Element | null {
  const groups = useMemo(() => endpointGroupsForPanel(panel), [panel]);
  const actions = groups.flatMap((group) => group.actions);
  const [selectedId, setSelectedId] = useState(actions[0]?.id || '');
  const selected = actions.find((action) => action.id === selectedId) || actions[0];
  const [queryText, setQueryText] = useState('{}');
  const [bodyText, setBodyText] = useState('{}');
  const [result, setResult] = useState('');
  const [error, setError] = useState('');
  const [running, setRunning] = useState(false);
  const ready = serviceStatus?.sidekick === 'ready' && serviceStatus?.webuiHealth === 'ready';

  useEffect(() => {
    setSelectedId(actions[0]?.id || '');
  }, [panel]);

  useEffect(() => {
    setQueryText(stringifyTemplate(selected?.queryTemplate));
    setBodyText(stringifyTemplate(selected?.bodyTemplate));
    setError('');
    setResult('');
  }, [selected?.id]);

  if (!groups.length || !selected) return null;

  async function runAction(action: WebuiEndpointAction): Promise<void> {
    if (!ready) return;
    if (action.dangerous && !window.confirm(`Run privileged WebUI action "${action.label}"?`)) return;
    setRunning(true);
    setError('');
    try {
      const query = parseJsonObject(queryText);
      const body = action.method === 'GET' ? undefined : parseJsonObject(bodyText);
      const payload = await window.lastbrowser.sidekick.requestWebui({
        method: action.method,
        path: action.path,
        query,
        body
      });
      setResult(JSON.stringify(payload, null, 2));
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : String(runError));
    } finally {
      setRunning(false);
    }
  }

  return (
    <details className={`advanced-webui-tools ${compact ? 'compact' : ''}`}>
      <summary>
        <span>Native WebUI API tools</span>
        <small>{actions.length} endpoints</small>
      </summary>
      <div className="advanced-webui-grid">
        <aside className="advanced-webui-actions">
          {groups.map((group) => (
            <section key={group.id}>
              <strong>{group.title}</strong>
              <small>{group.description}</small>
              {group.actions.map((action) => (
                <button
                  key={action.id}
                  type="button"
                  className={action.id === selected.id ? 'active' : ''}
                  onClick={() => setSelectedId(action.id)}
                >
                  <span>{action.label}</span>
                  <em>{action.method}</em>
                </button>
              ))}
            </section>
          ))}
        </aside>
        <main className="advanced-webui-runner">
          <header>
            <div>
              <strong>{selected.label}</strong>
              <span>{selected.method} {selected.path}</span>
            </div>
            {selected.dangerous && <ShieldAlert size={16} />}
          </header>
          {selected.queryTemplate && (
            <label>
              <span>Query JSON</span>
              <textarea value={queryText} onChange={(event) => setQueryText(event.target.value)} rows={3} />
            </label>
          )}
          {selected.method !== 'GET' && (
            <label>
              <span>Body JSON</span>
              <textarea value={bodyText} onChange={(event) => setBodyText(event.target.value)} rows={5} />
            </label>
          )}
          <button type="button" className="secondary-action compact" disabled={!ready || running} onClick={() => void runAction(selected)}>
            {running ? <Loader2 size={15} className="spin" /> : <Play size={15} />}
            <span>{ready ? 'Run native API' : 'Sidekick starting'}</span>
          </button>
          {error && <div className="workspace-error">{error}</div>}
          {result && <pre>{result}</pre>}
        </main>
      </div>
    </details>
  );
}
