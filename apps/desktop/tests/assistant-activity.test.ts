import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DesktopI18nProvider } from '../src/renderer/i18n.js';
import type { ActivitySnapshot, IndependentScope, RunState, RunView } from '../src/renderer/independent-contracts.js';
import { AssistantActivityView } from '../src/renderer/panels/AssistantActivity.js';

const scope: IndependentScope = { backendProfileId: 'backend', browserProfileId: 'browser', spaceId: 'space' };
const at = '2026-11-18T12:00:00Z';

function run(runId: string, state: RunState, targetSessionId: string | null = null): RunView {
  return {
    schemaVersion: 1, runId, scope, state, targetSessionId, dispatchId: runId, definitionId: runId,
    definitionRevision: 1, stateRevision: 1, controlEpoch: 0, reasonCode: null, createdAt: at, updatedAt: at,
    assistantProfileRevision: null, checkpointId: null, resultRef: null, waitingFor: null,
    counters: { toolCalls: 0, providerRequests: 0, activeSeconds: 0, measuredTokens: null },
  };
}

function snapshot(runs: RunView[], overrides: Partial<ActivitySnapshot> = {}): ActivitySnapshot {
  return {
    schemaVersion: 1, scope, observedAt: at, watermark: 1, sourceState: 'live', lastSuccessfulAt: at,
    runs, dispatches: [], activeChats: [], schedules: [], approvals: [], ...overrides,
  };
}

function markup(props: React.ComponentProps<typeof AssistantActivityView>): string {
  return renderToStaticMarkup(React.createElement(DesktopI18nProvider, null, React.createElement(AssistantActivityView, props)));
}

describe('Assistant Activity', () => {
  it('shows running and waiting scoped tasks before recent Nova sessions and omits finished work', () => {
    const html = markup({
      scope, activity: snapshot([
        run('queued-2', 'queued'), run('completed-3', 'completed'), run('running-1', 'running', 'running-session'),
        { ...run('foreign-5', 'running'), scope: { ...scope, spaceId: 'other' } },
        run('waiting-4', 'waiting_for_approval'),
      ]),
      sessions: [{ session_id: 'running-session', title: 'Running task chat' }, { session_id: 'nova-chat', title: 'Recent Nova chat' }],
      onSelectSession: () => {}, onOpenTask: () => {},
    });
    expect(html.indexOf('Running task chat')).toBeLessThan(html.indexOf('queued-2'));
    expect(html.indexOf('queued-2')).toBeLessThan(html.indexOf('Recent Nova chat'));
    expect(html).toContain('waiting-');
    expect(html).not.toContain('complete');
    expect(html).not.toContain('foreign');
    expect(html).not.toMatch(/<button[^>]*>[^<]*Terminal/i);
  });

  it('puts the authorized Nova action and timestamps inside the details for its task', () => {
    const html = markup({
      scope, activity: snapshot([run('running-1', 'running', 'work-chat'), run('queued-2', 'queued')]),
      sessions: [{ session_id: 'work-chat', title: 'Scoped work chat' }],
      onOpenTask: () => {},
    });
    const details = html.match(/<details>[\s\S]*?<\/details>/g) ?? [];
    expect(details).toHaveLength(2);
    const [running, queued] = details;
    expect(running).toMatch(/<summary>.*Scoped work chat.*<\/summary>/);
    expect(running).toContain('<dt>Erstellt</dt>');
    expect(running).toContain('<dt>Aktualisiert</dt>');
    expect(running).toContain(`<time dateTime="${at}">`);
    expect(running).toMatch(/<button[^>]*>[^<]*öffnen<\/button>/i);
    expect(queued).not.toContain('<button');
    expect(html).not.toMatch(/terminal/i);
  });

  it('labels stale observations and does not make their task actions available', () => {
    const html = markup({
      scope, activity: snapshot([run('stale-run', 'running', 'past')], { sourceState: 'stale' }),
      sessions: [{ session_id: 'past', title: 'Existing Nova chat' }], onOpenTask: () => {},
    });
    expect(html).toContain('Live-Daten nicht verfügbar');
    expect(html).toContain('Existing Nova chat');
    expect(html).not.toContain('<button');
  });

  it('does not present an out-of-scope or unavailable observation as an empty task list', () => {
    for (const activity of [
      snapshot([run('hidden-1', 'running')], { sourceState: 'unavailable' }),
      snapshot([run('hidden-2', 'running')], { scope: { ...scope, browserProfileId: 'other' } }),
    ]) {
      const html = markup({ scope, activity, sessions: [] });
      expect(html).not.toContain('hidden-');
      expect(html).not.toContain('Keine aktive Aufgabe gespeichert');
    }
    expect(markup({ scope, activity: snapshot([]), sessions: [] })).toContain('Keine aktive Aufgabe gespeichert');
  });
});
