import { describe, expect, it } from 'vitest';
import { createChildRunState, recoverChildRun, reduceChildRunEvent, CHILD_RUN_LIMITS } from '../src/renderer/child-run-controller';
import type { ChildRunSnapshot, ChildRunEvent } from '../src/renderer/child-run-contracts';
const binding = { scope: { backendProfileId: 'profile-a', spaceId: 'space-a', browserProfileId: 'browser-a' }, parentSessionId: 'parent', parentTurnId: 'turn' };
const snapshot = (id: string, overrides: Partial<ChildRunSnapshot> = {}): ChildRunSnapshot => ({ ...binding, schemaVersion: 1, subagentId: id, parentSubagentId: null, childSessionId: `session-${id}`, depth: 1, model: { provider: 'fixture', model: 'fixture' }, status: 'running', revision: 1, watermark: 1, observedAt: '2026-10-04T10:00:00Z', title: 'Same title', messages: [], ...overrides });
const event = (id: string, sequence: number, delta: string): ChildRunEvent => ({ ...snapshot(id), sequence, kind: 'answer_delta', payload: { delta }, at: '2026-10-04T10:00:01Z' });
describe('actual child run streams', () => {
  it('isolates simultaneous equally named children and never mutates parent tokens', () => {
    const parent = { content: 'parent-only' };
    let state = recoverChildRun(recoverChildRun(createChildRunState(binding), snapshot('a')), snapshot('b'));
    state = reduceChildRunEvent(state, event('a', 2, 'A'));
    state = reduceChildRunEvent(state, event('b', 2, 'B'));
    state = reduceChildRunEvent(state, event('a', 3, '2'));
    expect(state.children.a.snapshot.messages[0].content).toBe('A2');
    expect(state.children.b.snapshot.messages[0].content).toBe('B');
    expect(parent.content).toBe('parent-only');
  });
  it('reloads snapshot and ignores duplicate events', () => {
    const actual = snapshot('a', { watermark: 3, revision: 2, messages: [{ id: 'answer:a', role: 'assistant', content: 'saved', at: 'now' }] });
    const state = recoverChildRun(createChildRunState(binding), actual);
    expect(reduceChildRunEvent(state, event('a', 3, 'duplicate'))).toBe(state);
    expect(reduceChildRunEvent(state, event('a', 4, '!')).children.a.snapshot.messages[0].content).toBe('saved!');
  });
  it('rejects foreign scopes, turns, and reassigned child sessions', () => {
    const state = recoverChildRun(createChildRunState(binding), snapshot('a'));
    expect(recoverChildRun(state, snapshot('b', { scope: { ...binding.scope, backendProfileId: 'other' } }))).toBe(state);
    expect(reduceChildRunEvent(state, { ...event('a', 2, 'bad'), parentTurnId: 'other' })).toBe(state);
    expect(reduceChildRunEvent(state, { ...event('a', 2, 'bad'), childSessionId: 'other' })).toBe(state);
  });
  it('marks gaps without applying tails and recovers from actual watermark', () => {
    let state = recoverChildRun(createChildRunState(binding), snapshot('a'));
    state = reduceChildRunEvent(state, event('a', 3, 'lost-prefix'));
    expect(state.children.a.requiresResync).toBe(true);
    state = reduceChildRunEvent(state, event('a', 2, 'late'));
    expect(state.children.a.snapshot.messages).toEqual([]);
    state = recoverChildRun(state, snapshot('a', { watermark: 3, revision: 2 }));
    expect(state.children.a.requiresResync).toBe(false);
    expect(reduceChildRunEvent(state, event('a', 4, 'next')).children.a.snapshot.messages[0].content).toBe('next');
  });
  it('prevents late delta or stale snapshot from reopening terminal runs', () => {
    const state = recoverChildRun(createChildRunState(binding), snapshot('a', { status: 'completed', watermark: 5, revision: 3 }));
    expect(reduceChildRunEvent(state, event('a', 6, 'late'))).toBe(state);
    expect(recoverChildRun(state, snapshot('a', { watermark: 6, revision: 4 }))).toBe(state);
  });
  it('limits child count and rendered answer size', () => {
    let state = recoverChildRun(createChildRunState(binding), snapshot('a'));
    state = reduceChildRunEvent(state, event('a', 2, 'x'.repeat(CHILD_RUN_LIMITS.text + 20)));
    expect(state.children.a.snapshot.messages[0].content.length).toBe(CHILD_RUN_LIMITS.text);
    expect(state.children.a.truncated).toBe(true);
    for (let i = 0; i < CHILD_RUN_LIMITS.children; i++) state = recoverChildRun(state, snapshot(`id${i}`));
    expect(Object.keys(state.children)).toHaveLength(CHILD_RUN_LIMITS.children);
    expect(state.overflow).toBe(true);
  });
  it('accepts authoritative start snapshot and rejects mismatched envelope', () => {
    const start = { ...event('a', 1, ''), kind: 'started' as const, payload: { snapshot: snapshot('a') } };
    const state = createChildRunState(binding);
    expect(reduceChildRunEvent(state, start).children.a.snapshot.subagentId).toBe('a');
    expect(reduceChildRunEvent(state, { ...start, payload: { snapshot: snapshot('b') } })).toBe(state);
  });
  it('requests bounded recovery when the start event was missed', () => {
    let state = reduceChildRunEvent(createChildRunState(binding), event('a', 3, 'unknown'));
    expect(state.children).toEqual({});
    expect(state.missing.a.subagentId).toBe('a');
    state = recoverChildRun(state, snapshot('a', { watermark: 3 }));
    expect(state.missing).toEqual({});
    expect(state.children.a.snapshot.messages).toEqual([]);
  });
});
