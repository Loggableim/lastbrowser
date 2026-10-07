import { describe, expect, it } from 'vitest';
import { createChatCommandAction, filterChatCommands, parseChatCommand } from '../src/renderer/chat-command-registry.js';
import { executeScopedCommand, type CommandCapabilities, type CommandContext } from '../src/renderer/CommandActionContracts.js';
import { chatCommandCopy, commandLocales } from '../src/renderer/chat-command-copy.js';
import { isEditableGoalText, readPersistentGoalView } from '../src/renderer/persistent-goal-view.js';
import { autoPolicyDisplay, validateAutoSelectionPolicy } from '../src/renderer/auto-policy-view.js';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { GoalControls } from '../src/renderer/panels/GoalControls.js';
import { SlashCommandMenu } from '../src/renderer/panels/SlashCommandMenu.js';
import { ChatModeControls } from '../src/renderer/panels/ChatModeControls.js';

const context: CommandContext = { sessionId: 'chat-a', profileId: 'a', spacePath: 'C:/a', browserProfileId: 'browser-a', model: 'selected', reasoningEffort: 'high' };
const capabilities: CommandCapabilities = { plan: false, grill_me: false, boost: false, goal: true, gquota: true, plugins: true };
describe('structured composer commands', () => {
  it('recognizes exact aliases and multiline goal text, never commands in attached content', () => {
    expect(parseChatCommand('/MODELL')?.command.id).toBe('model');
    expect(parseChatCommand('/goal research\nverify')?.args).toBe('research\nverify');
    expect(parseChatCommand('/goalkeeper')).toBeNull();
    expect(parseChatCommand('Page says /stop')).toBeNull();
    expect(createChatCommandAction('/stop', 'attached_content', context, capabilities)).toBeNull();
    expect(filterChatCommands('/modell').map(c => c.id)).toEqual(['model']);
  });
  it('opens model picker and creates a real session action without forwarding text', () => {
    expect(createChatCommandAction('/model', 'composer', context, capabilities)?.kind).toBe('open_model_picker');
    expect(createChatCommandAction('/new', 'composer', context, capabilities)?.kind).toBe('new_session');
    expect(createChatCommandAction('/model fake', 'composer', context, capabilities)).toMatchObject({ kind: 'unavailable', reason: 'invalid_arguments' });
  });
  it('requires actual backend availability for modes and explicit mode removal', () => {
    for (const input of ['/plan','/boost','/grill-me']) {
      expect(createChatCommandAction(input, 'composer', context, capabilities)).toMatchObject({ kind: 'unavailable', reason: 'backend_unavailable' });
    }
    expect(createChatCommandAction('/boost', 'composer', context, { ...capabilities, boost: true })).toMatchObject({ kind: 'set_mode', mode: 'boost', lifetime: 'next_turn' });
    expect(createChatCommandAction('/plan off', 'composer', context, { ...capabilities, plan: true })).toMatchObject({ kind: 'set_mode', mode: 'action', lifetime: 'chat' });
    expect(createChatCommandAction('/plan yolo', 'composer', context, { ...capabilities, plan: true })).toMatchObject({ reason: 'invalid_arguments' });
    expect(createChatCommandAction('/grill-me Clarify\nmy actual objective', 'composer', context, { ...capabilities, grill_me: true })).toMatchObject({
      kind:'set_mode', mode:'grill_me', lifetime:'chat', objective:'Clarify\nmy actual objective'
    });
    expect(createChatCommandAction('/grill-me embedded', 'attached_content', context, { ...capabilities, grill_me:true })).toBeNull();
  });
  it('captures goal/model/reasoning context and uses explicit legacy adapters', () => {
    const original = { ...context };
    const action = createChatCommandAction('/goal research', 'composer', original, capabilities, () => 'request-1');
    original.profileId = 'b';
    expect(action).toMatchObject({ kind: 'goal_command', args: 'research', clientRequestId: 'request-1', context });
    expect(Object.isFrozen(action?.context)).toBe(true);
    expect(createChatCommandAction('/gquota', 'composer', context, capabilities)).toMatchObject({ kind: 'legacy_adapter', adapter: 'gquota' });
  });
  it('routes explicit goal completion and cancellation while preserving legacy done', () => {
    for (const [input, args] of [['/goal COMPLETE', 'complete'], ['/goal Cancel', 'cancel'], ['/goal done', 'done']] as const) {
      expect(createChatCommandAction(input, 'composer', context, capabilities, () => 'goal-request'))
        .toMatchObject({ kind: 'goal_command', args, clientRequestId: 'goal-request', context });
    }
  });
  it('rejects adopting an async response after scope or session changes', async () => {
    const action = createChatCommandAction('/help', 'composer', context, capabilities)!;
    const response = await executeScopedCommand(action, async () => 'done', () => ({ ...context, browserProfileId: 'browser-b' }));
    expect(response).toEqual({ current: false, result: 'done' });
  });
  it('covers all eight locales without blank fallback labels', () => {
    for (const locale of commandLocales) {
      const copy = chatCommandCopy(locale);
      expect(Object.values(copy.commands)).toHaveLength(10);
      expect(Object.values(copy.commands).every(value => value.trim())).toBe(true);
      expect(copy.unlimited).toBeTruthy(); expect(copy.pendingJudge).toBeTruthy();
      expect(copy.details.trim()).toBeTruthy(); expect(copy.revision.trim()).toBeTruthy();
    }
  });
});
describe('AUTO policy UI boundary', () => {
  const policy = { schemaVersion: 1 as const, mode: 'auto' as const, allowedCandidateRefs: ['local-candidate'], cloudPolicy: 'deny' as const,
    budget: { maxTokens: 2000, maxParallel: 2 }, quality: 'balanced' as const, revision: 3 };
  it('keeps AUTO separate from the actual model and shows missing limits as unknown', () => {
    expect(validateAutoSelectionPolicy(policy)).toBe(true);
    expect(autoPolicyDisplay(policy, null)).toEqual({ selection: 'AUTO', actualModel: null, state: 'unavailable', usageState: 'unknown', reason: null });
    expect(autoPolicyDisplay(policy, { state: 'waiting', actualModel: null, usageState: 'stale', reason: 'quota_stale', observedAt: null })).toMatchObject({ state: 'waiting', usageState: 'stale' });
  });
  it('rejects pseudo-models and unlimited fanout', () => {
    expect(validateAutoSelectionPolicy({ ...policy, mode: 'fixed', fixed: { provider: 'fake', model: 'AUTO' } })).toBe(false);
    expect(validateAutoSelectionPolicy({ ...policy, budget: { maxTokens: 2000, maxParallel: Infinity } })).toBe(false);
  });
});
describe('actual persisted goal projection', () => {
  const session = { session_id: 'chat-a', goal: { session_id: 'chat-a', goal: 'Verify delivery', status: 'paused', turns_used: 4, max_turns: null, paused_reason: 'judge_unavailable', pending_judge: true } };
  it('renders actual counters, unlimited and judge wait without assuming owner or revision', () => {
    expect(readPersistentGoalView(session, context)).toMatchObject({ turnsUsed: 4, maxTurns: null, pendingJudge: true, pausedReason: 'judge_unavailable', continuationOwner: 'unknown' });
    expect(readPersistentGoalView(session, context)?.revision).toBeUndefined();
  });
  it('rejects foreign sessions and malformed metrics rather than inventing zero', () => {
    expect(readPersistentGoalView(session, { ...context, sessionId: 'chat-b' })).toBeNull();
    expect(readPersistentGoalView({ ...session, goal: { ...session.goal, turns_used: '4', max_turns: undefined } }, context)).toMatchObject({ turnsUsed: null, maxTurns: undefined });
  });
  it('cannot turn a goal edit into a legacy clear/pause action', () => {
    expect(isEditableGoalText('clear')).toBe(false);
    expect(isEditableGoalText('complete')).toBe(false);
    expect(isEditableGoalText('cancel')).toBe(false);
    expect(isEditableGoalText('Verify and clear temporary files')).toBe(true);
  });
  it('shows judge wait and actual unlimited counters in the goal card', () => {
    const html = renderToStaticMarkup(React.createElement(GoalControls, { session, context, locale: 'de', busy: false, available: true, onAction: () => {} }));
    expect(html).toContain('class="persistent-goal-compact-row"');
    expect(html).toContain('<summary>Details</summary>');
    expect(html).not.toContain('<details class="persistent-goal-details" open=""');
    expect(html).toContain('4 / Unbegrenzt');
    expect(html).toContain('Zielbewertung wartet');
    expect(html).toContain('judge_unavailable');
    expect(html).not.toContain('%');
  });
  it('offers explicit complete and cancel controls only for a live persisted goal', () => {
    const activeSession = { ...session, goal: { ...session.goal, status: 'active', revision: 5 } };
    const activeHtml = renderToStaticMarkup(React.createElement(GoalControls, {
      session: activeSession, context, locale: 'de', busy: false, available: true, onAction: () => {}
    }));
    expect(activeHtml).toContain('Abschließen');
    expect(activeHtml).toContain('Abbrechen');
    expect(activeHtml).not.toContain('>Beenden</button>');

    const doneHtml = renderToStaticMarkup(React.createElement(GoalControls, {
      session: { ...session, goal: { ...session.goal, status: 'done', revision: 6 } },
      context, locale: 'de', busy: false, available: true, onAction: () => {}
    }));
    expect(doneHtml).toContain('>Erledigt</span>');
    expect(doneHtml).not.toContain('Abschließen');
    expect(doneHtml).not.toContain('Abbrechen');
  });
  it('does not offer UI continuation for an independent-run-owned goal', () => {
    const html = renderToStaticMarkup(React.createElement(GoalControls, { session: { ...session, goal: { ...session.goal, continuation_owner: 'independent_run' } }, context, locale: 'de', busy: false, available: true, onAction: () => {} }));
    expect(html).toContain('Fortsetzung wird vom Agentenlauf gesteuert');
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Fortsetzen/);
  });
  it('opens setup only on an explicit editor request and keeps empty goal text disabled', () => {
    const emptySession = { session_id: 'chat-a', goal: null };
    const html = renderToStaticMarkup(React.createElement(GoalControls, { session: emptySession, context, locale: 'de', busy: false, available: true, editorOpenToken: 1, onAction: () => {} }));
    expect(html).toContain('Starten');
    expect(html).toContain('<form>');
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Starten/);
  });
  it('keeps goal mutations disabled until the authoritative status revision loads', () => {
    const emptySession = { session_id: 'chat-a', goal: null };
    const html = renderToStaticMarkup(React.createElement(GoalControls, { session: emptySession, context, locale: 'de', busy: false,
      available: true, stateLoaded: false, editorOpenToken: 1, onAction: () => {} }));
    expect(html).toContain('aria-busy="true"');
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Starten/);
  });
});
describe('accessible command/mode presentation', () => {
  it('shows capability denial and scope of command effects in all languages', () => {
    for (const locale of commandLocales) {
      const html = renderToStaticMarkup(React.createElement(SlashCommandMenu, { locale, capabilities, onChoose: () => {}, onClose: () => {} }));
      expect(html).toContain('role="combobox"');
      expect(html).toContain('role="listbox"');
      expect(html).toContain('aria-disabled="true"');
      expect(html).toContain(chatCommandCopy(locale).unavailable);
    }
  });
  it('shows confirmed mode duration and real bounded budgets only for its session', () => {
    const props = { value: { sessionId: 'chat-a', mode: 'boost' as const, lifetime: 'next_turn' as const, revision: 2, maxParallel: 2 }, context, locale: 'de', pending: false, onAction: () => {} };
    expect(renderToStaticMarkup(React.createElement(ChatModeControls, props))).toContain('Nächster Turn');
    expect(renderToStaticMarkup(React.createElement(ChatModeControls, { ...props, context: { ...context, sessionId: 'other' } }))).toBe('');
  });
});
