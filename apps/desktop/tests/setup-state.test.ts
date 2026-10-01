import { describe, expect, it } from 'vitest';
import {
  canSubmitCloudSetup,
  cloudProviderOptions,
  defaultSetupState,
  firstRunStatus,
  isGeminiCliProvider,
  isFirstRunRequired,
  modelsForProvider,
  openProviderOAuthUrl,
  normalizeSetupState,
  reconcileGeminiCliModelSelection
} from '../src/renderer/setup-state.js';

describe('cloud first-run setup state', () => {
  it('identifies Gemini CLI by provider ID, not by model family', () => {
    expect(isGeminiCliProvider('google-gemini-cli')).toBe(true);
    expect(isGeminiCliProvider('Gemini-OAuth')).toBe(true);
    expect(isGeminiCliProvider('openrouter')).toBe(false);
    expect(isGeminiCliProvider('')).toBe(false);
  });

  it('reconciles retired Gemini CLI selections against the current live catalog only', () => {
    const liveIds = ['gemini-3-flash-preview', 'gemini-3.1-pro-preview'];

    expect(reconcileGeminiCliModelSelection('google-gemini-cli', 'gemini-2.5-flash', liveIds))
      .toBe('gemini-3-flash-preview');
    expect(reconcileGeminiCliModelSelection('google-gemini-cli', 'gemini-3.1-pro-preview', liveIds))
      .toBe('gemini-3.1-pro-preview');
    expect(reconcileGeminiCliModelSelection('openrouter', 'gemini-2.5-flash', liveIds))
      .toBeUndefined();
  });

  it('does not open legacy Gemini CLI authorization URLs', async () => {
    const openExternal = vi.fn(async () => true);
    const openConnectWindow = vi.fn(async () => undefined);
    const opened = await openProviderOAuthUrl('google-gemini-cli', 'https://accounts.google.com/oauth', {
      openExternal,
      openConnectWindow
    });

    expect(opened).toBe(false);
    expect(openExternal).not.toHaveBeenCalled();
    expect(openConnectWindow).not.toHaveBeenCalled();
  });

  it('does not fall back to an embedded window when Google system-browser access is unavailable', async () => {
    const openConnectWindow = vi.fn(async () => undefined);
    const opened = await openProviderOAuthUrl('google-gemini-cli', 'https://accounts.google.com/oauth', {
      openConnectWindow
    });

    expect(opened).toBe(false);
    expect(openConnectWindow).not.toHaveBeenCalled();
  });

  it('opens Antigravity OAuth only in the system browser', async () => {
    const openExternal = vi.fn(async () => true);
    const openConnectWindow = vi.fn(async () => true);
    expect(await openProviderOAuthUrl('antigravity', 'https://accounts.google.com/oauth', {
      openExternal, openConnectWindow
    })).toBe(true);
    expect(openExternal).toHaveBeenCalledOnce();
    expect(openConnectWindow).not.toHaveBeenCalled();

    expect(await openProviderOAuthUrl('antigravity', 'https://accounts.google.com/oauth', {
      openExternal: vi.fn(async () => false), openConnectWindow
    })).toBe(false);
    expect(openConnectWindow).not.toHaveBeenCalled();
  });

  it('opens the ChatGPT Codex OAuth URL in the dedicated connect window and reports failure', async () => {
    const openConnectWindow = vi.fn(async () => true);
    const opened = await openProviderOAuthUrl('openai-codex', 'https://auth.openai.com/authorize', {
      openConnectWindow
    });

    expect(openConnectWindow).toHaveBeenCalledWith('https://auth.openai.com/authorize');
    expect(opened).toBe(true);

    const rejectedOpen = await openProviderOAuthUrl('openai-codex', 'https://auth.openai.com/authorize', {
      openConnectWindow: vi.fn(async () => false)
    });
    expect(rejectedOpen).toBe(false);
  });

  it('prefers the system browser for Codex device sign-in and falls back if it is unavailable', async () => {
    const openExternal = vi.fn(async () => true);
    const openConnectWindow = vi.fn(async () => true);
    expect(await openProviderOAuthUrl('openai-codex', 'https://auth.openai.com/codex/device', {
      openExternal, openConnectWindow
    })).toBe(true);
    expect(openExternal).toHaveBeenCalledOnce();
    expect(openConnectWindow).not.toHaveBeenCalled();

    expect(await openProviderOAuthUrl('openai-codex', 'https://auth.openai.com/codex/device', {
      openExternal: vi.fn(async () => false), openConnectWindow
    })).toBe(true);
    expect(openConnectWindow).toHaveBeenCalledOnce();
  });

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
      'antigravity',
      'alibaba',
      'openrouter',
      'anthropic',
      'lmstudio',
      'ollama'
    ]);
    expect(options.find((option) => option.id === 'ollama')?.keyOptional).toBe(true);
  });

  it('carries the OAuth connect info through for supported CLI providers', () => {
    const options = cloudProviderOptions({
      setup: {
        providers: [
          { id: 'anthropic', label: 'Anthropic', oauth_provider: 'anthropic', oauth_label: 'Claude Code OAuth' }
        ]
      }
    });

    expect(options.find((option) => option.id === 'anthropic')?.oauthProvider).toBe('anthropic');
  });

  it('keeps Antigravity connectable when onboarding metadata omits oauth_provider', () => {
    const options = cloudProviderOptions({ setup: { providers: [
      { id: 'antigravity', label: 'Antigravity (Google)' }
    ] } });
    expect(options.find((option) => option.id === 'antigravity')?.oauthProvider).toBe('antigravity');
  });

  it('filters unsupported personal Gemini subscription connectors from provider selection', () => {
    const options = cloudProviderOptions({ setup: { providers: [
      { id: 'google-gemini-cli', label: 'Gemini CLI', oauth_provider: 'google-gemini-cli' },
      { id: 'gemini-cli-acp', label: 'Gemini CLI (official ACP)', models: [{ id: 'gemini-cli' }] }
    ] } });
    expect(options.map((option) => option.id)).not.toContain('google-gemini-cli');
    expect(options.map((option) => option.id)).not.toContain('gemini-cli-acp');
  });

  it('shows cloud provider fallbacks before the onboarding API responds', () => {
    expect(cloudProviderOptions(null).map((option) => option.id)).toEqual([
      'openai-codex',
      'antigravity',
      'ollama',
      'ollama-cloud',
      'openrouter',
      'alibaba',
      'openai',
      'anthropic',
      'gemini',
      'deepseek'
    ]);
    expect(modelsForProvider(null, 'ollama-cloud')).toContainEqual({
      id: 'deepseek-v4.1-flash',
      label: 'DeepSeek V4.1 Flash'
    });
  });

  it('keeps Antigravity in provider settings even when the runtime catalog omits it', () => {
    const options = cloudProviderOptions({ setup: { providers: [
      { id: 'openrouter', label: 'OpenRouter' },
      { id: 'ollama-cloud', label: 'Ollama Cloud' }
    ] } });
    expect(options.map((option) => option.id)).toEqual(['openai-codex', 'antigravity', 'alibaba', 'openrouter', 'ollama-cloud']);
    expect(modelsForProvider(null, 'antigravity').map((model) => model.id)).toEqual([
      'gemini-3.1-pro-preview',
      'gemini-3-flash-preview'
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
      'antigravity',
      'alibaba',
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
    expect(modelsForProvider(null, 'google-gemini-cli')).toEqual([]);
    expect(modelsForProvider(null, 'gemini-cli-acp')).toEqual([]);
    expect(modelsForProvider(null, 'gemini')).toEqual([]);
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

  it('uses only live backend Gemini CLI models and never resurrects stale IDs', () => {
    expect(modelsForProvider({ setup: { providers: [{
      id: 'google-gemini-cli',
      models: [{ id: 'gemini-3-flash-preview', label: 'Gemini 3 Flash Preview' }]
    }] } }, 'google-gemini-cli')).toEqual([
      { id: 'gemini-3-flash-preview', label: 'Gemini 3 Flash Preview' }
    ]);
  });

  it('offers OpenRouter as a key-required provider', () => {
    const openrouter = cloudProviderOptions(null).find((option) => option.id === 'openrouter');
    expect(openrouter?.keyOptional).toBe(false);
    expect(modelsForProvider(null, 'openrouter').length).toBeGreaterThan(0);
  });

  it('offers Alibaba Cloud as a key-required provider with a workspace endpoint', () => {
    const alibaba = cloudProviderOptions(null).find((option) => option.id === 'alibaba');
    expect(alibaba).toMatchObject({
      label: 'Alibaba Cloud (DashScope)',
      keyOptional: false,
      requiresBaseUrl: true
    });
    expect(alibaba?.defaultBaseUrl).toBeUndefined();
    expect(modelsForProvider(null, 'alibaba')).toEqual([]);
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
    expect(PROVIDER_RECOMMENDATIONS['google-gemini-cli']).toBeUndefined();

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
  }, 15000);

  it('renders the first-run provider picker without a temporal-dead-zone error', async () => {
    const React = await import('react');
    const { renderToString } = await import('react-dom/server');
    const { DesktopI18nProvider } = await import('../src/renderer/i18n.js');
    const { FirstRunSetupPane } = await import('../src/renderer/components/FirstRunSetupPane.js');
    const html = renderToString(React.createElement(
      DesktopI18nProvider,
      null,
      React.createElement(FirstRunSetupPane, {
        status: null,
        onboardingStatus: { setup: { providers: [{ id: 'openrouter', label: 'OpenRouter' }] } },
        setupLoading: false,
        error: '',
        saving: false,
        onRefreshOnboarding: async () => {},
        onSubmit: async () => {},
        onDismiss: () => {}
      })
    ));
    expect(html).toContain('OpenRouter');
  });
});
