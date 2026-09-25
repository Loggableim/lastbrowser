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

  it('surfaces every provider the onboarding API offers, including local ones', () => {
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

    // Local / key-optional providers are legitimate choices, not noise: the
    // wizard must offer Ollama and LM Studio alongside the cloud providers.
    expect(options.map((option) => option.id)).toEqual([
      'openai-codex',
      'openrouter',
      'anthropic',
      'lmstudio',
      'ollama'
    ]);
    expect(options.find((option) => option.id === 'ollama')?.keyOptional).toBe(true);
  });

  it('carries the OAuth connect info through for CLI providers', () => {
    const options = cloudProviderOptions({
      setup: {
        providers: [
          { id: 'anthropic', label: 'Anthropic', oauth_provider: 'anthropic', oauth_label: 'Claude Code OAuth' },
          { id: 'google-gemini-cli', label: 'Gemini CLI', oauth_provider: 'google-gemini-cli', oauth_label: 'Google-Konto / Gemini CLI', key_optional: true }
        ]
      }
    });

    const gemini = options.find((option) => option.id === 'google-gemini-cli');
    expect(gemini?.oauthProvider).toBe('google-gemini-cli');
    expect(gemini?.oauthLabel).toBe('Google-Konto / Gemini CLI');
    expect(options.find((option) => option.id === 'anthropic')?.oauthProvider).toBe('anthropic');
  });

  it('shows cloud provider fallbacks before the onboarding API responds', () => {
    expect(cloudProviderOptions(null).map((option) => option.id)).toEqual([
      'openai-codex',
      'google-gemini-cli',
      'ollama',
      'ollama-cloud',
      'openrouter',
      'openai',
      'anthropic',
      'gemini',
      'deepseek'
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
    }).map((option) => option.id)).toEqual([
      'openai-codex',
      'openrouter',
      'openai'
    ]);
  });

  it('returns preselectable model fallbacks for cloud providers', () => {
    expect(modelsForProvider(null, 'openai-codex')[0]).toEqual({
      id: 'gpt-5.5',
      label: 'GPT-5.5'
    });
    expect(modelsForProvider(null, 'openai-codex').map((model) => model.id)).toContain('gpt-5.3-codex');
    expect(modelsForProvider(null, 'google-gemini-cli')[0]?.id).toBe('gemini-2.5-flash');
    expect(modelsForProvider(null, 'google-gemini-cli').map((m) => m.id)).toContain('gemini-2.5-pro');
    expect(modelsForProvider(null, 'ollama')[0]?.id).toBe('llama3.3');
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

  it('normalizes botName and personality settings when provided', () => {
    expect(normalizeSetupState({
      cloudSetupComplete: true,
      provider: 'google-gemini-cli',
      model: 'gemini-2.5-flash',
      botName: '  Hermes  ',
      personality: '  developer  '
    })).toEqual({
      cloudSetupComplete: true,
      provider: 'google-gemini-cli',
      model: 'gemini-2.5-flash',
      botName: 'Hermes',
      personality: 'developer'
    });
  });

  it('highlights the top-3 LLMs with detailed benefits and recommended badges (Paket 2.1)', async () => {
    const { PROVIDER_RECOMMENDATIONS } = await import('../src/renderer/provider-presentation.js');
    expect(PROVIDER_RECOMMENDATIONS['google-gemini-cli']).toBeDefined();
    expect(PROVIDER_RECOMMENDATIONS['google-gemini-cli'].badgeType).toBe('recommended');
    expect(PROVIDER_RECOMMENDATIONS['google-gemini-cli'].benefits.some((b) => b.includes('Multi-Account'))).toBe(true);

    expect(PROVIDER_RECOMMENDATIONS['openai-codex']).toBeDefined();
    expect(PROVIDER_RECOMMENDATIONS['openai-codex'].badgeType).toBe('popular');
    expect(PROVIDER_RECOMMENDATIONS['openai-codex'].benefits.some((b) => b.includes('o3-mini') || b.includes('Coding-Parität'))).toBe(true);

    expect(PROVIDER_RECOMMENDATIONS['ollama']).toBeDefined();
    expect(PROVIDER_RECOMMENDATIONS['ollama'].badgeType).toBe('private');
    expect(PROVIDER_RECOMMENDATIONS['ollama'].benefits.some((b) => b.includes('100% Offline-Privatsphäre'))).toBe(true);
  });

  it('provides browser choices for external profile import (Paket 2.2)', async () => {
    const { BROWSER_CHOICES } = await import('../src/renderer/components/FirstRunSetupPane.js');
    expect(BROWSER_CHOICES).toHaveLength(4);
    const ids = BROWSER_CHOICES.map((b) => b.id);
    expect(ids).toContain('chrome');
    expect(ids).toContain('edge');
    expect(ids).toContain('firefox');
    expect(ids).toContain('brave');
  });
});

