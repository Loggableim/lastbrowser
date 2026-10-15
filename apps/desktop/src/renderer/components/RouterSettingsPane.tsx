import React, { useState } from 'react';
import { classifyAutoRouterPrompt } from '../opencode-auto-router.js';
import { DEFAULT_ROUTER_ORDER, ROUTER_BENCH_SEED, ROUTER_SETTINGS_KEY, measureRouterSelection, readRouterSettings, suggestRouterOrder, writeRouterSettings, type RouterBenchRow } from '../router-settings.js';

type Tab = 'setup' | 'benchmark' | 'advanced';

function label(row: { provider: string; model: string }): string {
  return `${row.provider}/${row.model}`;
}

export function RouterSettingsPane(): React.ReactElement {
  const [tab, setTab] = useState<Tab>('setup');
  const [settings, setSettings] = useState(() => readRouterSettings(window.localStorage.getItem(ROUTER_SETTINGS_KEY)));
  const [rows, setRows] = useState<readonly RouterBenchRow[]>(ROUTER_BENCH_SEED);
  const [picked, setPicked] = useState<Record<string, boolean>>(() => Object.fromEntries(DEFAULT_ROUTER_ORDER.map(model => [label(model), true])));
  const [suggestion, setSuggestion] = useState<ReturnType<typeof suggestRouterOrder> | null>(null);
  const save = (next: typeof settings) => {
    const stored = { ...next, order: next.order.filter(model => !ROUTER_BENCH_SEED.some(row => row.provider === model.provider && row.model === model.model && row.paid)) };
    setSettings(stored);
    window.localStorage.setItem(ROUTER_SETTINGS_KEY, writeRouterSettings(stored));
  };
  const freeRows = rows.filter(row => !row.paid && (row.failureRate ?? 0) < 1);
  return <section className="router-settings" aria-label="Router">
    <header style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
      <div><strong>Router</strong><div>OpenCode Go</div></div>
      <div role="tablist" aria-label="Router pages">
        <button type="button" aria-selected={tab === 'setup'} onClick={() => setTab('setup')}>Setup</button>
        <button type="button" aria-selected={tab === 'benchmark'} onClick={() => setTab('benchmark')}>Benchmark</button>
        <button type="button" aria-selected={tab === 'advanced'} onClick={() => setTab('advanced')}>Advanced settings</button>
      </div>
    </header>
    {tab === 'setup' && <div style={{ overflow: 'hidden' }}>
      <label style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12 }}>
        <span>Auto-routing</span>
        <input type="checkbox" role="switch" checked={settings.enabled} onChange={event => save({ ...settings, enabled: event.target.checked })} />
      </label>
      <ol>{settings.order.map((model, index) => <li key={label(model)}>{index === 0 ? 'Primary' : `Fallback ${index}`}: {label(model)}</li>)}</ol>
      <button type="button" onClick={() => setTab('benchmark')}>Benchmark erneut ausführen</button>
    </div>}
    {tab === 'benchmark' && <div>
      {freeRows.map(row => <label key={label(row)} style={{ display: 'flex', gap: 8 }}>
        <input type="checkbox" checked={picked[label(row)] === true} onChange={event => setPicked(current => ({ ...current, [label(row)]: event.target.checked }))} />
        <span>{label(row)}</span>
      </label>)}
      <p>Paid models stay visible in Advanced settings and are not part of this run.</p>
      <button type="button" onClick={() => {
        const selected = freeRows.filter(row => picked[label(row)]).map(row => ({ provider: row.provider, model: row.model }));
        const measured = measureRouterSelection(selected, text => classifyAutoRouterPrompt({ text }).kind, rows);
        setRows(current => [...measured, ...current.filter(row => row.paid || (row.failureRate ?? 0) >= 1 || !selected.some(model => model.provider === row.provider && model.model === row.model))]);
        setSuggestion(suggestRouterOrder(measured));
      }}>Ausgewählte Modelle messen</button>
      {suggestion && suggestion.length > 0 && <div>
        <p>Vorschlag: {suggestion.map(label).join(' → ')}</p>
        <button type="button" onClick={() => { save({ ...settings, order: suggestion }); setTab('setup'); }}>Übernehmen</button>
      </div>}
    </div>}
    {tab === 'advanced' && <div style={{ overflow: 'auto', maxHeight: 280 }}>
      <table>
        <thead><tr><th>Model</th><th>Speed</th><th>Quality</th><th>Price</th><th>Median</th><th>p90</th><th>Class</th><th>Failures</th><th>Score</th></tr></thead>
        <tbody>{rows.map(row => <tr key={label(row)}>
          <td>{label(row)}{row.paid ? ` · paid ${row.pricePer1kUsd} USD/1k` : ''}</td>
          <td>{row.speedRating}</td><td>{row.qualityRating}</td><td>{row.priceRating}</td>
          <td>{row.medianMs ?? '—'}</td><td>{row.p90Ms ?? '—'}</td>
          <td>{row.classificationHit == null ? '—' : `${Math.round(row.classificationHit * 100)}%`}</td>
          <td>{row.failureRate ?? '—'}</td><td>{row.score}</td>
        </tr>)}</tbody>
      </table>
    </div>}
  </section>;
}
