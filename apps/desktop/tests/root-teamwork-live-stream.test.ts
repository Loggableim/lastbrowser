import { describe, expect, it } from 'vitest';
import { applyLiveTeamworkUpdate, beginLiveTeamworkTurn, bindLiveChatAssistantStream, readTeamworkStreamUpdate } from '../src/renderer/teamwork-live-stream.js';
import type { NativeChatBinding } from '../src/renderer/native-chat-control.js';
import type { DesktopChatMessage } from '../src/renderer/shell-state.js';

const scope = { backendProfileId: '12345678-1234-1234-1234-123456789012', spaceId: '22345678-1234-1234-1234-123456789012', browserProfileId: 'profile-a' };
const binding: NativeChatBinding = { scope, sessionId: 'session-a', streamId: 'stream-a', workspacePath: 'C:/space-a', browserProfileId: 'profile-a' };

function event(name: string, data: Record<string, unknown>, overrides: Record<string, unknown> = {}) {
  return {
    streamId: binding.streamId,
    event: name,
    data,
    nativeContext: { schemaVersion: 1, scope, sessionId: binding.sessionId, streamId: binding.streamId, writerGeneration: 'writer-a' },
    ...overrides,
  };
}

function update(payload: unknown) {
  return readTeamworkStreamUpdate(payload, binding, binding.sessionId, binding.streamId);
}

function initialMessages(): DesktopChatMessage[] {
  const placeholder: DesktopChatMessage[] = [
    { role: 'user', content: 'Compare these models' },
    { role: 'assistant', content: 'Working on it...', pending: true },
  ];
  return beginLiveTeamworkTurn(bindLiveChatAssistantStream(placeholder, binding.sessionId, binding.streamId, 'Compare these models'), binding.streamId);
}

describe('native Teamwork live stream', () => {
  it('requires exact Main provenance, scope, session, and stream before accepting Teamwork events', () => {
    expect(update(event('teamwork_worker_start', { worker_id: 'worker-1' }))?.event).toBe('teamwork_worker_start');
    expect(update({ ...event('teamwork_worker_start', {}), nativeContext: undefined })).toBeNull();
    expect(update(event('teamwork_worker_start', {}, { streamId: 'other-stream' }))).toBeNull();
    expect(update(event('teamwork_worker_start', {}, { sessionId: 'other-session' }))).toBeNull();
    expect(update(event('teamwork_worker_start', {}, { nativeContext: { ...event('x', {}).nativeContext, writerGeneration: '' } }))).toBeNull();
    expect(update(event('teamwork_worker_start', {}, { nativeContext: { ...event('x', {}).nativeContext, scope: { ...scope, spaceId: '32345678-1234-1234-1234-123456789012' } } }))).toBeNull();
    expect(update(event('teamwork_worker_started', {}))).toBeNull();
  });

  it('retains only bounded provider candidate diagnostics with recognized codes', () => {
    const candidateDiagnostics = Array.from({ length: 65 }, (_, index) => ({ provider: 'custom:provider', model: `model-${index}`, code: 'provider_admission_denied' }));
    candidateDiagnostics[1] = { provider: 'private-url-not-exposed', model: 'secret-model', code: 'raw_exception_details' };
    const messages = applyLiveTeamworkUpdate(initialMessages(), binding.streamId, update(event('teamwork_plan', {
      status: 'complete', candidateDiagnostics,
    }))!);
    const card = messages[1].teamwork as { candidateDiagnostics?: Array<{ provider: string; model: string; code: string }> };
    expect(card.candidateDiagnostics).toHaveLength(63);
    expect(card.candidateDiagnostics?.some((entry) => entry.model === 'secret-model' || entry.provider === 'private-url-not-exposed')).toBe(false);
    expect(card.candidateDiagnostics?.[0]).toEqual({ provider: 'custom:provider', model: 'model-0', code: 'provider_admission_denied' });
  });

  it('keeps the whole planned roster visible while live deltas arrive and shows actual provider/model provenance', () => {
    const stage = update(event('teamwork_stage', { stage: 'debate', workers: [
      { worker_index: 1, name: 'Gemini review', model: 'gemini-model', provider: 'google', role: 'reviewer' },
      { worker_index: 2, name: 'GPT synthesis', model: 'gpt-model', provider: 'openai', role: 'synthesizer' },
      { worker_index: 3, name: 'Ollama check', model: 'ollama-model', provider: 'ollama_cloud', role: 'fact checker' },
    ] }))!;
    let messages = applyLiveTeamworkUpdate(initialMessages(), binding.streamId, stage);
    const start = update(event('teamwork_worker_start', { worker_id: 'worker-1', worker_index: 1, attempt: 1, provider_id: 'google', model_id: 'gemini-live', role: 'reviewer', status: 'running' }))!;
    messages = applyLiveTeamworkUpdate(messages, binding.streamId, start);
    const delta = update(event('teamwork_worker_delta', { worker_id: 'worker-1', worker_index: 1, attempt: 1, provider_id: 'google', model_id: 'gemini-live', role: 'reviewer', status: 'streaming', content: 'First part.' }))!;
    messages = applyLiveTeamworkUpdate(messages, binding.streamId, delta);
    messages = applyLiveTeamworkUpdate(messages, binding.streamId, update(event('teamwork_worker_delta', { worker_id: 'worker-1', worker_index: 1, attempt: 1, status: 'streaming', content: ' Second part.' }))!);
    const card = messages[1].teamwork as { status: string; plannedWorkers: Array<{ provider: string; model: string; status: string }>; drafts: Array<{ content: string; status: string }> };
    expect(card.status).toBe('running');
    expect(card.plannedWorkers).toHaveLength(3);
    expect(card.plannedWorkers[0]).toMatchObject({ provider: 'google', model: 'gemini-live', status: 'running' });
    expect(card.plannedWorkers.slice(1).every((worker) => worker.status === 'planned')).toBe(true);
    expect(card.drafts[0]).toMatchObject({ content: 'First part. Second part.', status: 'running' });
  });

  it('projects worker terminal outcomes and allowlisted safe failure codes without accepting stale attempts', () => {
    let messages = applyLiveTeamworkUpdate(initialMessages(), binding.streamId, update(event('teamwork_stage', { stage: 'debate', workers: [
      { worker_id: 'worker-gpt', worker_index: 0, attempt: 2, name: 'GPT', model: 'gpt-model', provider: 'custom:gpt-fixture', role: 'architect' },
    ] }))!);
    messages = applyLiveTeamworkUpdate(messages, binding.streamId, update(event('teamwork_worker_end', {
      worker_id: 'worker-gpt', worker_index: 0, attempt: 1, model_id: 'gpt-model', provider_id: 'custom:gpt-fixture', role: 'architect', status: 'failed', failure_code: 'provider_admission_denied',
    }))!);
    let card = messages[1].teamwork as { plannedWorkers: Array<{ status: string; failureCode?: string; error?: string; content?: string }>; drafts: Array<{ status: string; content: string }> };
    expect(card.plannedWorkers[0]).toMatchObject({ status: 'planned', attempt: 2 });
    messages = applyLiveTeamworkUpdate(messages, binding.streamId, update(event('teamwork_worker_start', {
      worker_id: 'worker-gpt', worker_index: 0, attempt: 2, model_id: 'gpt-model', provider_id: 'custom:gpt-fixture', role: 'architect', status: 'running',
    }))!);
    messages = applyLiveTeamworkUpdate(messages, binding.streamId, update(event('teamwork_worker_delta', {
      worker_id: 'worker-gpt', worker_index: 0, attempt: 2, model_id: 'gpt-model', provider_id: 'custom:gpt-fixture', role: 'architect', status: 'streaming', content: 'partial output',
    }))!);
    messages = applyLiveTeamworkUpdate(messages, binding.streamId, update(event('teamwork_worker_end', {
      worker_id: 'worker-gpt', worker_index: 0, attempt: 2, model_id: 'gpt-model', provider_id: 'custom:gpt-fixture', role: 'architect', status: 'failed', failure_code: 'provider_admission_denied',
    }))!);
    card = messages[1].teamwork as typeof card;
    expect(card.plannedWorkers[0]).toMatchObject({ status: 'failed', failureCode: 'provider_admission_denied', workerId: 'worker-gpt' });
    messages = applyLiveTeamworkUpdate(messages, binding.streamId, update(event('teamwork_worker_delta', {
      worker_id: 'worker-gpt', worker_index: 0, attempt: 2, status: 'streaming', content: 'late output must not be appended',
    }))!);
    messages = applyLiveTeamworkUpdate(messages, binding.streamId, update(event('teamwork_draft', {
      model: 'gpt-model', provider: 'custom:gpt-fixture', name: 'GPT', role: 'architect', status: 'failed', error: 'HTTP 429', skipped: true,
    }))!);
    card = messages[1].teamwork as typeof card;
    expect(card.plannedWorkers).toHaveLength(1);
    expect(card.plannedWorkers[0]).toMatchObject({ status: 'failed', failureCode: 'provider_admission_denied', error: 'HTTP 429' });
    expect(card.drafts[0]).toMatchObject({ status: 'failed', content: 'partial output' });

    const untrusted = update(event('teamwork_worker_end', {
      worker_id: 'worker-gpt', worker_index: 0, attempt: 2, status: 'failed', failure_code: 'secret_or_unrecognized_error',
    }))!;
    messages = applyLiveTeamworkUpdate(messages, binding.streamId, untrusted);
    card = messages[1].teamwork as typeof card;
    expect(card.plannedWorkers[0].failureCode).toBe('provider_admission_denied');
  });

  it('renders single-provider fallback from authoritative stage and persisted model_roles', () => {
    let messages = applyLiveTeamworkUpdate(initialMessages(), binding.streamId, update(event('teamwork_stage', {
      stage: 'single_provider', provider: 'custom:gpt-fixture', model: 'root-gpt-fixture', role: 'single_provider', status: 'running',
    }))!);
    let card = messages[1].teamwork as { plannedWorkers: Array<{ provider: string; model: string; status: string }>; completeReceived?: boolean; drafts: Array<{ provider: string; model: string; status: string }> };
    expect(card.plannedWorkers).toMatchObject([{ provider: 'custom:gpt-fixture', model: 'root-gpt-fixture', status: 'running' }]);
    messages = applyLiveTeamworkUpdate(messages, binding.streamId, update(event('teamwork_complete', {
      strategy: 'single_provider', drafts: [], model_roles: [{ model: 'root-gpt-fixture', provider: 'custom:gpt-fixture', role: 'single_provider' }],
    }))!);
    card = messages[1].teamwork as typeof card;
    expect(card.completeReceived).toBe(true);
    expect(card.drafts).toMatchObject([{ workerId: 'single-provider', provider: 'custom:gpt-fixture', model: 'root-gpt-fixture', status: 'complete' }]);
    messages = applyLiveTeamworkUpdate(messages, binding.streamId, update(event('stream_end', {}))!);
    expect((messages[1].teamwork as { status: string }).status).toBe('complete');
  });

  it('treats complete as provisional, then distinguishes persisted completion, cancellation, and partial failure', () => {
    let messages = initialMessages();
    messages = applyLiveTeamworkUpdate(messages, binding.streamId, update(event('teamwork_worker_start', { worker_id: 'worker-1', role: 'reviewer', status: 'running' }))!);
    messages = applyLiveTeamworkUpdate(messages, binding.streamId, update(event('teamwork_worker_delta', { worker_id: 'worker-1', role: 'reviewer', status: 'streaming', content: 'Partial contribution' }))!);
    messages = applyLiveTeamworkUpdate(messages, binding.streamId, update(event('teamwork_complete', { strategy: 'balanced', drafts: [{ model: 'gemini-model', provider: 'google', role: 'reviewer', name: 'Gemini', status: 'complete', content: 'Finished contribution' }] }))!);
    expect((messages[1].teamwork as { status: string }).status).toBe('running');
    messages = applyLiveTeamworkUpdate(messages, binding.streamId, update(event('stream_end', {}))!);
    expect((messages[1].teamwork as { status: string }).status).toBe('complete');

    const cancelled = applyLiveTeamworkUpdate(initialMessages(), binding.streamId, update(event('cancel', {}))!);
    expect((cancelled[1].teamwork as { status: string }).status).toBe('stopped');
    const partial = applyLiveTeamworkUpdate(messages, binding.streamId, update(event('error', { error: 'redacted failure' }))!);
    expect((partial[1].teamwork as { status: string }).status).toBe('partial');
  });

  it('never mutates a newer assistant placeholder with an older stream event', () => {
    const old = initialMessages();
    const newer = bindLiveChatAssistantStream([...old, { role: 'assistant', content: 'Working on it...', pending: true }], 'session-a', 'stream-b');
    const changed = applyLiveTeamworkUpdate(newer, 'stream-a', update(event('teamwork_worker_delta', { worker_id: 'worker-1', status: 'streaming', content: 'stale' }))!);
    expect(changed.at(-1)).not.toHaveProperty('teamwork');
  });
});
