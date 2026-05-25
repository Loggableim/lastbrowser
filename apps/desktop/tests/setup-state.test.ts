import { describe, expect, it } from 'vitest';
import {
  canSubmitCloudSetup,
  cloudProviderOptions,
  defaultSetupState,
  firstRunStatus,
  isFirstRunRequired,
  modelsForProvider,
  normalizeSetupState
} from '../src/renderer/setup-state.js';

describe('cloud first-run setup state', () => {
  it('requires setup until local cloud setup state and backend readiness agree', () => {
    const readyStatus = { system: { chat_ready: true } };

    expect(isFirstRunRequired(defaultSetupState, readyStatus)).toBe(true);
    expect(isFirstRunRequired({ cloudSetupComplete: true, provider: 'openrouter', model: 'openai/gpt-5.4-mini' }, readyStatus)).toBe(false);
    expect(isFirstRunRequired({ cloudSetupComplete: true, provider: 'openrouter', model: 'openai/gpt-5.4-mini' }, { system: { chat_ready: false } })).toBe(true);
  });

  it('normalizes missing or malformed persisted state', () => {
    expect(normalizeSetupState(null)).toEqual(defaultSetupState);
    expect(normalizeSetupState({ cloudSetupComplete: true, provider: ' openrouter ', model: ' model-a ' })).toEqual({
      cloudSetupComplete: true,
      provider: 'openrouter',
      model: 'model-a'
    });
  });

  it('filters onboarding providers to cloud choices for this slice', () => {
    const options = cloudProviderOptions({
      setup: {
        providers: [
          { id: 'openrouter', label: 'OpenRouter' },
          { id: 'anthropic', label: 'Anthropic' },
          { id: 'lmstudio', label: 'LM Studio', requires_base_url: true, key_optional: true },
          { id: 'ollama', label: 'Ollama', requires_base_url: true, key_optional: true }
        ]
      }
    });

    expect(options).toEqual([
      { id: 'openai-codex', label: 'OpenAI Codex (ChatGPT)' },
      { id: 'openrouter', label: 'OpenRouter' },
      { id: 'anthropic', label: 'Anthropic' }
    ]);
  });

  it('shows cloud provider fallbacks before the onboarding API responds', () => {
    expect(cloudProviderOptions(null)).toEqual([
      { id: 'openai-codex', label: 'OpenAI Codex (ChatGPT)' },
      { id: 'openrouter', label: 'OpenRouter' },
      { id: 'openai', label: 'OpenAI' },
      { id: 'anthropic', label: 'Anthropic' },
      { id: 'gemini', label: 'Google Gemini' }
    ]);
  });

  it('keeps OpenAI Codex available even when the WebUI catalog omits it', () => {
    expect(cloudProviderOptions({
      setup: {
        providers: [
          { id: 'openrouter', label: 'OpenRouter' },
          { id: 'openai', label: 'OpenAI' }
        ]
      }
    })).toEqual([
      { id: 'openai-codex', label: 'OpenAI Codex (ChatGPT)' },
      { id: 'openrouter', label: 'OpenRouter' },
      { id: 'openai', label: 'OpenAI' }
    ]);
  });

  it('returns preselectable model fallbacks for cloud providers', () => {
    expect(modelsForProvider(null, 'openai-codex')[0]).toEqual({
      id: 'gpt-5.5',
      label: 'GPT-5.5'
    });
    expect(modelsForProvider(null, 'openai-codex').map((model) => model.id)).toContain('gpt-5.3-codex');
    expect(modelsForProvider(null, 'openai')[0]?.id).toBe('gpt-5.5');
    expect(modelsForProvider(null, 'openrouter')[0]?.id).toBe('anthropic/claude-sonnet-4.6');
  });

  it('prefers provider-supplied models over fallback models', () => {
    expect(modelsForProvider({
      setup: {
        providers: [
          { id: 'openai-codex', models: [{ id: 'gpt-live', label: 'GPT Live' }] }
        ]
      }
    }, 'openai-codex')).toEqual([{ id: 'gpt-live', label: 'GPT Live' }]);
  });

  it('derives first-run warmup states from service and onboarding readiness', () => {
    expect(firstRunStatus(null, null)).toMatchObject({
      id: 'starting-runtime',
      label: 'Starting runtime',
      canSubmit: false
    });

    expect(firstRunStatus({ sidekick: 'ready', webuiHealth: 'checking' }, null)).toMatchObject({
      id: 'sidekick-ready',
      label: 'Sidekick ready',
      canSubmit: false
    });

    expect(firstRunStatus({ sidekick: 'ready', webuiHealth: 'ready' }, { system: { chat_ready: false } })).toMatchObject({
      id: 'provider-needed',
      label: 'Provider needed',
      canSubmit: true
    });

    expect(firstRunStatus({ sidekick: 'ready', webuiHealth: 'ready' }, { system: { chat_ready: true } })).toMatchObject({
      id: 'ready',
      label: 'Ready',
      canSubmit: true
    });

    expect(firstRunStatus({ sidekick: 'error', webuiHealth: 'unreachable', lastError: 'Python missing' }, null)).toMatchObject({
      id: 'error',
      label: 'Runtime needs attention',
      detail: 'Python missing',
      canSubmit: false
    });
  });

  it('keeps setup submission disabled until the WebUI API is reachable', () => {
    expect(canSubmitCloudSetup(firstRunStatus({ sidekick: 'ready', webuiHealth: 'checking' }, null))).toBe(false);
    expect(canSubmitCloudSetup(firstRunStatus({ sidekick: 'ready', webuiHealth: 'ready' }, { system: { chat_ready: false } }))).toBe(true);
  });
});
