import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { ChildRunBubbles, childRunLabels, type ChildRunLocale } from '../src/renderer/components/ChildRunBubbles';
import { createChildRunState, recoverChildRun } from '../src/renderer/child-run-controller';
import type { ChildRunSnapshot } from '../src/renderer/child-run-contracts';
const fixture: ChildRunSnapshot = { schemaVersion: 1, scope: { backendProfileId: 'profile', spaceId: 'space', browserProfileId: 'browser' }, parentSessionId: 'parent', parentTurnId: 'turn', subagentId: 'child', parentSubagentId: null, childSessionId: 'session', depth: 1, model: { provider: 'fixture', model: 'fixture' }, status: 'running', revision: 1, watermark: 1, observedAt: 'now', messages: [{ id: 'message', role: 'assistant', content: '<script>unsafe</script>', at: 'now' }] };
describe('child bubbles presentation', () => {
  it('uses native keyboard disclosure and escaped content without control callbacks', () => {
    const state = recoverChildRun(createChildRunState(fixture), fixture);
    let calls = 0;
    const html = renderToStaticMarkup(createElement(ChildRunBubbles, { state, onResync: () => { calls++; } }));
    expect(html).toContain('<details');
    expect(html).toContain('<summary>');
    expect(html).toContain('aria-label="Subagents"');
    expect(html).toContain('&lt;script&gt;unsafe&lt;/script&gt;');
    expect(calls).toBe(0);
    expect(html).not.toContain('progressbar');
  });
  it('provides localized actual statuses in all eight languages', () => {
    const state = recoverChildRun(createChildRunState(fixture), fixture);
    for (const locale of Object.keys(childRunLabels) as ChildRunLocale[]) {
      const html = renderToStaticMarkup(createElement(ChildRunBubbles, { state, locale, onResync: () => {} }));
      expect(html).toContain(childRunLabels[locale].statuses.running);
      expect(Object.keys(childRunLabels[locale].statuses)).toHaveLength(8);
    }
  });
  it('calls host content renderer for shared Markdown formatting', () => {
    const state = recoverChildRun(createChildRunState(fixture), fixture);
    const html = renderToStaticMarkup(createElement(ChildRunBubbles, { state, onResync: () => {}, renderContent: content => createElement('strong', null, content) }));
    expect(html).toContain('<strong>');
  });
  it('assigns deterministic color nuances and depth indentation across multiple subagents', () => {
    const sub1: ChildRunSnapshot = { ...fixture, subagentId: 'subagent-alpha', depth: 1, status: 'running' };
    const sub2: ChildRunSnapshot = { ...fixture, subagentId: 'subagent-beta', depth: 2, status: 'completed' };
    let state = createChildRunState(sub1);
    state = recoverChildRun(state, sub1);
    state = recoverChildRun(state, sub2);
    const html = renderToStaticMarkup(createElement(ChildRunBubbles, { state, onResync: () => {} }));
    expect(html).toContain('data-color-index=');
    expect(html).toContain('data-depth="1"');
    expect(html).toContain('data-depth="2"');
    expect(html).toContain('--child-depth:1');
    expect(html).toContain('child-run-streaming-dot');
  });
});

