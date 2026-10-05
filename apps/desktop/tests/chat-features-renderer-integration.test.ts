import { describe, expect, it, vi } from 'vitest';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ChildRunBubbles, getSubagentColorIndex } from '../src/renderer/components/ChildRunBubbles.js';
import { createChildRunState, recoverChildRun } from '../src/renderer/child-run-controller.js';
import type { ChildRunSnapshot } from '../src/renderer/child-run-contracts.js';
import { GoalControls } from '../src/renderer/panels/GoalControls.js';
import { isEditableGoalText, readPersistentGoalView } from '../src/renderer/persistent-goal-view.js';
import { createChatCommandAction, filterChatCommands, parseChatCommand } from '../src/renderer/chat-command-registry.js';
import { SlashCommandMenu } from '../src/renderer/panels/SlashCommandMenu.js';
import type { CommandCapabilities, CommandContext } from '../src/renderer/CommandActionContracts.js';
import {
  readObservedDecisionFromSession,
  readObservedDecisionFromStreamEvent,
  resolveActiveObservedDecision,
  type ActualDecisionRecord,
  type ModelPolicyResponse,
} from '../src/renderer/model-policy-client.js';
import { ModelPolicyControls } from '../src/renderer/components/ModelPolicyControls.js';
import { modelPolicyCopy } from '../src/renderer/i18n/model-policy-copy.js';

/**
 * Controlled contract & integration test suite for auxiliary chat features on fresh renderer state.
 *
 * NOTE: Controlled test events and simulated payloads in this suite serve as contract proofs
 * for the renderer layer. They do NOT replace full end-to-end backend execution proofs,
 * which require packaging and running against a live Sidekick process.
 */
describe('chat auxiliary features renderer integration (controlled contract verification)', () => {
  const context: CommandContext = {
    sessionId: 'session-main',
    profileId: 'profile-a',
    spacePath: 'C:/space/project',
    browserProfileId: 'browser-profile-1',
    model: 'claude-3-5-sonnet',
    reasoningEffort: 'high',
  };

  const capabilities: CommandCapabilities = {
    plan: true,
    grill_me: true,
    boost: true,
    goal: true,
    gquota: true,
    plugins: true,
  };

  describe('1. Multiple simultaneously streaming subagents with nuance and collapse preservation', () => {
    const baseSubagent: ChildRunSnapshot = {
      schemaVersion: 1,
      scope: { backendProfileId: 'prof', spaceId: 'sp', browserProfileId: 'bp' },
      parentSessionId: 'session-main',
      parentTurnId: 'turn-1',
      subagentId: 'sub-researcher',
      parentSubagentId: null,
      childSessionId: 'sub-sess-1',
      depth: 1,
      model: { provider: 'anthropic', model: 'claude-3-5-sonnet' },
      status: 'running',
      revision: 1,
      watermark: 1,
      observedAt: '2026-10-04T12:00:00Z',
      messages: [{ id: 'm-1', role: 'assistant', content: 'Analyzing repo structure…', at: '2026-10-04T12:00:01Z' }],
    };

    it('renders at least two simultaneously streaming subagent bubbles with distinct color nuances and depth indentation', () => {
      const sub1: ChildRunSnapshot = {
        ...baseSubagent,
        subagentId: 'sub-researcher-1',
        title: 'Researcher Alpha',
        depth: 1,
        status: 'running',
        messages: [{ id: 'm-1', role: 'assistant', content: 'Scanning files…', at: '2026-10-04T12:00:01Z' }],
      };
      const sub2: ChildRunSnapshot = {
        ...baseSubagent,
        subagentId: 'sub-planner-2',
        title: 'Planner Beta',
        depth: 2,
        status: 'running',
        messages: [{ id: 'm-2', role: 'assistant', content: 'Synthesizing task plan…', at: '2026-10-04T12:00:02Z' }],
      };

      let state = createChildRunState(sub1);
      state = recoverChildRun(state, sub1);
      state = recoverChildRun(state, sub2);

      const html = renderToStaticMarkup(createElement(ChildRunBubbles, { state, onResync: () => {} }));

      // Both bubbles present
      expect(html).toContain('Researcher Alpha');
      expect(html).toContain('Planner Beta');

      // Both streaming dots active
      const streamingDots = html.match(/child-run-streaming-dot/g);
      expect(streamingDots?.length).toBe(2);

      // Depth hierarchy indentation
      expect(html).toContain('data-depth="1"');
      expect(html).toContain('data-depth="2"');
      expect(html).toContain('--child-depth:0');
      expect(html).toContain('--child-depth:1');

      // Distinct deterministic color nuance
      const color1 = getSubagentColorIndex('sub-researcher-1');
      const color2 = getSubagentColorIndex('sub-planner-2');
      expect(color1).not.toBe(color2);
      expect(html).toContain(`data-color-index="${color1}"`);
      expect(html).toContain(`data-color-index="${color2}"`);
    });

    it('preserves user disclosure/collapse state upon receiving further streaming tokens', () => {
      // Step 1: Initial running snapshot
      const sub: ChildRunSnapshot = {
        ...baseSubagent,
        subagentId: 'sub-researcher-1',
        title: 'Researcher',
        status: 'running',
        messages: [{ id: 'm-1', role: 'assistant', content: 'Token chunk 1', at: '2026-10-04T12:00:01Z' }],
      };

      let state = createChildRunState(sub);
      state = recoverChildRun(state, sub);

      // Render default collapsed markup
      const htmlCollapsed = renderToStaticMarkup(createElement(ChildRunBubbles, { state, onResync: () => {} }));
      expect(htmlCollapsed).toContain('<details');
      expect(htmlCollapsed).not.toContain('open=""');

      // Render user-opened markup
      const htmlInitial = renderToStaticMarkup(createElement(ChildRunBubbles, { state, defaultOpen: true, onResync: () => {} }));
      expect(htmlInitial).toContain('<details');
      expect(htmlInitial).toContain('open=""');

      // Step 2: Simulate streaming updates with additional tokens
      const subUpdated: ChildRunSnapshot = {
        ...sub,
        revision: 2,
        messages: [
          { id: 'm-1', role: 'assistant', content: 'Token chunk 1 Token chunk 2 Token chunk 3', at: '2026-10-04T12:00:02Z' },
        ],
      };
      state = recoverChildRun(state, subUpdated);

      const htmlUpdated = renderToStaticMarkup(createElement(ChildRunBubbles, { state, defaultOpen: true, onResync: () => {} }));
      expect(htmlUpdated).toContain('open=""');
      expect(htmlUpdated).toContain('Token chunk 1 Token chunk 2 Token chunk 3');
      expect(htmlUpdated).toContain('child-run-streaming-dot');
    });
  });

  describe('2. Persistent goal creation and rehydration after reload', () => {
    it('creates persistent goal on empty session (revision 0) and re-opens after reload', () => {
      // Fresh session with no goal
      const emptySession = { session_id: 'session-main', goal: null };

      let recordedAction: unknown = null;
      const onAction = vi.fn((act: unknown) => { recordedAction = act; });

      const htmlEmpty = renderToStaticMarkup(createElement(GoalControls, {
        session: emptySession,
        context,
        locale: 'de',
        busy: false,
        available: true,
        editorOpenToken: 1,
        onAction,
      }));

      // Explicit /goal setup opens the editor; a new chat does not open it implicitly.
      expect(htmlEmpty).toContain('Starten');
      // An empty objective cannot be submitted; the explicit setup remains available.
      expect(htmlEmpty).toMatch(/<button[^>]*disabled=""[^>]*>Starten/);

      // Trigger goal command
      const startAction = createChatCommandAction('/goal Finalize store submission', 'composer', context, capabilities, () => 'req-goal-1');
      expect(startAction).toMatchObject({
        kind: 'goal_command',
        args: 'Finalize store submission',
        clientRequestId: 'req-goal-1',
      });
      expect(isEditableGoalText('Finalize store submission')).toBe(true);

      // Simulate session after reload with backend-persisted goal (revision 1)
      const reloadedSession = {
        session_id: 'session-main',
        goal: {
          session_id: 'session-main',
          goal: 'Finalize store submission',
          status: 'active',
          turns_used: 2,
          max_turns: 10,
          revision: 1,
        },
      };

      const goalView = readPersistentGoalView(reloadedSession, context);
      expect(goalView).not.toBeNull();
      expect(goalView?.goal).toBe('Finalize store submission');
      expect(goalView?.turnsUsed).toBe(2);
      expect(goalView?.maxTurns).toBe(10);
      expect(goalView?.status).toBe('active');

      const htmlReloaded = renderToStaticMarkup(createElement(GoalControls, {
        session: reloadedSession,
        context,
        locale: 'de',
        busy: false,
        available: true,
        onAction,
      }));

      expect(htmlReloaded).toContain('Finalize store submission');
      expect(htmlReloaded).toContain('2 / 10');
      expect(htmlReloaded).toContain('Pausieren');
    });
  });

  describe('3. Slash menu navigation, keyboard filtering and /model picker invocation', () => {
    it('filters commands via slash input and invokes open_model_picker for /model', () => {
      // Filtering commands
      const filteredModel = filterChatCommands('/mod');
      expect(filteredModel.map(c => c.id)).toContain('model');

      const filteredPlan = filterChatCommands('/pla');
      expect(filteredPlan.map(c => c.id)).toContain('plan');

      const filteredGoal = filterChatCommands('/goa');
      expect(filteredGoal.map(c => c.id)).toContain('goal');

      // Exact parse
      const parsed = parseChatCommand('/model');
      expect(parsed?.command.id).toBe('model');

      // Command action dispatch produces open_model_picker
      const action = createChatCommandAction('/model', 'composer', context, capabilities);
      expect(action).toEqual({
        kind: 'open_model_picker',
        context,
      });

      // Render SlashCommandMenu with accessible combobox/listbox attributes
      const menuHtml = renderToStaticMarkup(createElement(SlashCommandMenu, {
        locale: 'en',
        capabilities,
        onChoose: () => {},
        onClose: () => {},
      }));

      expect(menuHtml).toContain('role="combobox"');
      expect(menuHtml).toContain('role="listbox"');
      expect(menuHtml).toContain('/model');
      expect(menuHtml).toContain('/plan');
      expect(menuHtml).toContain('/goal');
      expect(menuHtml).toContain('/boost');
      expect(menuHtml).toContain('/grill-me');
    });
  });

  describe('4. AUTO configuration and observed execution evidence separation', () => {
    const autoPolicyResponse: ModelPolicyResponse = {
      schemaVersion: 1,
      scope: { backendProfileId: 'bp', spaceId: 'sp', browserProfileId: 'browser-profile-1' },
      sessionId: 'session-main',
      policy: {
        schemaVersion: 1,
        scope: { backendProfileId: 'bp', spaceId: 'sp', browserProfileId: 'browser-profile-1' },
        sessionId: 'session-main',
        revision: 2,
        mode: 'auto',
        allowedModels: [
          { provider: 'anthropic', model: 'claude-3-5-sonnet' },
          { provider: 'openai', model: 'gpt-4o' },
        ],
        orchestrator: { provider: 'anthropic', model: 'claude-3-5-sonnet' },
        cloudPolicy: 'allow',
        allowedCloudDataClasses: ['workspace'],
        budget: { requestsPerMinute: 10, tokensPerMinute: 200000, maxConcurrent: 2, maxCostMicrousdPerMinute: null, maxOutputTokens: 4096 },
        updatedAt: '2026-10-04T12:00:00Z',
      },
      status: [],
      executionAvailability: { available: true, sealedWorker: true },
    };

    it('displays decision unknown prior to execution while clearly showing configured routing preference', () => {
      // In German
      const htmlDe = renderToStaticMarkup(createElement(ModelPolicyControls, {
        value: autoPolicyResponse,
        candidates: [],
        pending: false,
        error: '',
        open: true,
        onOpen: () => {},
        onSave: () => {},
        onRefresh: () => {},
        locale: 'de',
        observedDecision: null,
      }));

      expect(htmlDe).toContain('<strong>Tatsächliche Entscheidung</strong>: Entscheidung noch nicht bekannt');
      expect(htmlDe).toContain('<strong>Konfigurierte Präferenz</strong>: anthropic · claude-3-5-sonnet (Konfigurierter Orchestrator)');

      // In Japanese
      const htmlJa = renderToStaticMarkup(createElement(ModelPolicyControls, {
        value: autoPolicyResponse,
        candidates: [],
        pending: false,
        error: '',
        open: true,
        onOpen: () => {},
        onSave: () => {},
        onRefresh: () => {},
        locale: 'ja',
        observedDecision: null,
      }));

      expect(htmlJa).toContain('<strong>実際の決定</strong>: 決定はまだ不明です');
      expect(htmlJa).toContain('<strong>設定された優先設定</strong>: anthropic · claude-3-5-sonnet (設定されたオーケストレーター)');
    });

    it('displays authoritative decision when observed from stream completion without confusing with preference', () => {
      // Simulated controlled done event from stream
      const streamDonePayload = {
        streamId: 'stream-turn-auto-1',
        event: 'done',
        data: {
          session: { session_id: 'session-main' },
          provider_evidence: {
            provider_id: 'openai',
            model_id: 'gpt-4o',
            successful_chat: true,
          },
        },
      };

      const decision = readObservedDecisionFromStreamEvent(streamDonePayload, 'session-main', 'stream-turn-auto-1');
      expect(decision).not.toBeNull();
      expect(decision?.provider).toBe('openai');
      expect(decision?.model).toBe('gpt-4o');
      expect(decision?.source).toBe('provider_evidence');

      const htmlWithDecision = renderToStaticMarkup(createElement(ModelPolicyControls, {
        value: autoPolicyResponse,
        candidates: [],
        pending: false,
        error: '',
        open: true,
        onOpen: () => {},
        onSave: () => {},
        onRefresh: () => {},
        locale: 'de',
        observedDecision: decision,
      }));

      // Actual observed decision is openai · gpt-4o, while configured orchestrator preference was anthropic · claude-3-5-sonnet
      expect(htmlWithDecision).toContain('<strong>Tatsächliche Entscheidung</strong>: openai · gpt-4o');
      expect(htmlWithDecision).toContain('<strong>Konfigurierte Präferenz</strong>: anthropic · claude-3-5-sonnet (Konfigurierter Orchestrator)');
    });

    it('preserves unknown limits as unknown without inventing quotas', () => {
      const responseWithUnknownQuota: ModelPolicyResponse = {
        ...autoPolicyResponse,
        status: [
          {
            provider: 'anthropic',
            snapshots: [
              {
                schemaVersion: 1,
                provider: 'anthropic',
                groupKey: 'anthropic-tier-1',
                observedAt: '2026-10-04T12:00:00Z',
                observedRequestId: null,
                source: 'unknown',
                buckets: [
                  { resource: 'requests', limit: null, remaining: null, resetAt: null },
                  { resource: 'tokens', limit: 100000, remaining: null, resetAt: null },
                ],
                retryAt: null,
                actionRequired: false,
                statusCode: null,
                stale: false,
              },
            ],
          },
        ],
      };

      const htmlQuota = renderToStaticMarkup(createElement(ModelPolicyControls, {
        value: responseWithUnknownQuota,
        candidates: [],
        pending: false,
        error: '',
        open: true,
        onOpen: () => {},
        onSave: () => {},
        onRefresh: () => {},
        locale: 'de',
      }));

      // Limits and remaining values that are null are rendered as 'Unbekannt', never made up
      expect(htmlQuota).toContain('Verbleibend: Unbekannt');
      expect(htmlQuota).toContain('Limit: Unbekannt');
    });
  });
});
