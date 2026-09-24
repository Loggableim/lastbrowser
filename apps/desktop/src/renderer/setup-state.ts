export type SetupState = {
  cloudSetupComplete: boolean;
  provider: string;
  model: string;
  botName?: string;
  personality?: string;
};

export type OnboardingProvider = {
  id: string;
  label?: string;
  models?: Array<string | { id?: string; value?: string; label?: string }>;
  requires_base_url?: boolean;
  default_base_url?: string;
  key_optional?: boolean;
  oauth_provider?: string;
  oauth_label?: string;
};

export type OnboardingStatus = {
  system?: {
    chat_ready?: boolean;
    current_provider?: string | null;
  };
  setup?: {
    providers?: OnboardingProvider[];
  };
};

export type FirstRunServiceStatus = {
  sidekick?: 'starting' | 'ready' | 'stopped' | 'missing' | 'error';
  webuiHealth?: 'unknown' | 'checking' | 'ready' | 'unreachable';
  webuiUrl?: string;
  lastError?: string | null;
} | null;

export type FirstRunStatus = {
  id: 'starting-runtime' | 'sidekick-ready' | 'provider-needed' | 'ready' | 'error';
  label: string;
  detail: string;
  canSubmit: boolean;
};

export const defaultSetupState: SetupState = {
  cloudSetupComplete: false,
  provider: '',
  model: ''
};

const fallbackCloudProviders = [
  { id: 'openai-codex', label: 'OpenAI Codex (ChatGPT)', oauth_provider: 'openai-codex', oauth_label: 'ChatGPT Account' },
  { id: 'google-gemini-cli', label: 'Google Gemini (CLI)', oauth_provider: 'google-gemini-cli', oauth_label: 'Google-Konto (Gemini CLI)', key_optional: true },
  { id: 'ollama', label: 'Ollama (Lokal)', requires_base_url: false, key_optional: true, default_base_url: 'http://127.0.0.1:11434/v1' },
  { id: 'ollama-cloud', label: 'Ollama Cloud', requires_base_url: false, key_optional: false, default_base_url: 'https://ollama.com/v1' },
  { id: 'openrouter', label: 'OpenRouter' },
  { id: 'openai', label: 'OpenAI' },
  { id: 'anthropic', label: 'Anthropic' },
  { id: 'gemini', label: 'Google Gemini' },
  { id: 'deepseek', label: 'DeepSeek' }
];

const fallbackModelsByProvider: Record<string, Array<{ id: string; label: string }>> = {
  'google-gemini-cli': [
    { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash (Standard • Empfohlen)' },
    { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
    { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
    { id: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro Preview' },
    { id: 'gemini-3-flash-preview', label: 'Gemini 3 Flash Preview' }
  ],
  ollama: [
    { id: 'llama3.3', label: 'Llama 3.3 (70B)' },
    { id: 'llama3.2', label: 'Llama 3.2 (3B)' },
    { id: 'qwen2.5', label: 'Qwen 2.5' },
    { id: 'deepseek-r1', label: 'DeepSeek-R1 (Local)' },
    { id: 'mistral', label: 'Mistral (7B)' }
  ],
  'ollama-cloud': [
    { id: 'deepseek-v4-flash', label: 'DeepSeek V4 Flash' },
    { id: 'qwen3:32b', label: 'Qwen 3 (32B)' },
    { id: 'kimi-k3', label: 'Kimi K3' },
    { id: 'glm-5.3', label: 'GLM 5.3' },
    { id: 'nemotron-3-nano:30b', label: 'Nemotron 3 Nano (30B)' }
  ],
  deepseek: [
    { id: 'deepseek-chat', label: 'DeepSeek V3 (Chat)' },
    { id: 'deepseek-reasoner', label: 'DeepSeek R1 (Reasoner)' }
  ],
  'openai-codex': [
    { id: 'gpt-5.5', label: 'GPT-5.5' },
    { id: 'gpt-5.5-mini', label: 'GPT-5.5 Mini' },
    { id: 'gpt-5.4', label: 'GPT-5.4' },
    { id: 'gpt-5.4-mini', label: 'GPT-5.4 Mini' },
    { id: 'gpt-5.3-codex', label: 'GPT-5.3 Codex' },
    { id: 'gpt-5.2-codex', label: 'GPT-5.2 Codex' },
    { id: 'gpt-5.1-codex-max', label: 'GPT-5.1 Codex Max' },
    { id: 'gpt-5.1-codex-mini', label: 'GPT-5.1 Codex Mini' },
    { id: 'codex-mini-latest', label: 'Codex Mini (latest)' }
  ],
  openrouter: [
    { id: 'anthropic/claude-sonnet-4.6', label: 'Claude Sonnet 4.6' },
    { id: 'openai/gpt-5.5', label: 'GPT-5.5' },
    { id: 'openai/gpt-5.5-mini', label: 'GPT-5.5 Mini' },
    { id: 'google/gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro Preview' }
  ],
  openai: [
    { id: 'gpt-5.5', label: 'GPT-5.5' },
    { id: 'gpt-5.5-mini', label: 'GPT-5.5 Mini' },
    { id: 'gpt-5.4', label: 'GPT-5.4' },
    { id: 'gpt-5.4-mini', label: 'GPT-5.4 Mini' }
  ],
  anthropic: [
    { id: 'claude-opus-4.7', label: 'Claude Opus 4.7' },
    { id: 'claude-opus-4.6', label: 'Claude Opus 4.6' },
    { id: 'claude-sonnet-4.6', label: 'Claude Sonnet 4.6' },
    { id: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5' }
  ],
  gemini: [
    { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash (Standard • Empfohlen)' },
    { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
    { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
    { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite' },
    { id: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro Preview' },
    { id: 'gemini-3-flash-preview', label: 'Gemini 3 Flash Preview' }
  ]
};

const localProviderIds = new Set(['lmstudio', 'lm-studio', 'ollama', 'custom', 'local']);

export function normalizeSetupState(raw: unknown): SetupState {
  if (!raw || typeof raw !== 'object') return defaultSetupState;
  const data = raw as Partial<SetupState>;
  const botName = typeof data.botName === 'string' ? data.botName.trim() : '';
  const personality = typeof data.personality === 'string' ? data.personality.trim() : '';
  return {
    cloudSetupComplete: data.cloudSetupComplete === true,
    provider: String(data.provider || '').trim(),
    model: String(data.model || '').trim(),
    ...(botName ? { botName } : {}),
    ...(personality ? { personality } : {})
  };
}

export function isFirstRunRequired(state: SetupState, onboardingStatus: unknown): boolean {
  const status = onboardingStatus as OnboardingStatus | null;
  // The wizard is done once the user completed setup AND the runtime reports a
  // usable chat provider. `chat_ready` is the authoritative signal, but the
  // newer FastAPI WebUI may omit it while still being fully configured — in
  // that case fall back to the persisted setup state so the wizard does not
  // reappear on every launch.
  if (state.cloudSetupComplete === true) {
    const chatReady = status?.system?.chat_ready;
    if (chatReady === true) return false;
    if (chatReady === false) return true;
    // chat_ready unknown (undefined): trust the persisted setup state.
    return false;
  }
  return true;
}

export function firstRunStatus(serviceStatus: FirstRunServiceStatus, onboardingStatus: OnboardingStatus | null | undefined): FirstRunStatus {
  if (serviceStatus?.sidekick === 'error' || serviceStatus?.sidekick === 'missing') {
    return {
      id: 'error',
      label: 'Runtime needs attention',
      detail: serviceStatus.lastError || 'Sidekick could not start. Restart Lastbrowser or check the local runtime.',
      canSubmit: false
    };
  }

  if (!serviceStatus || serviceStatus.sidekick === 'starting' || serviceStatus.sidekick === 'stopped') {
    return {
      id: 'starting-runtime',
      label: 'Starting runtime',
      detail: 'Lastbrowser is preparing the local Sidekick service in the background.',
      canSubmit: false
    };
  }

  if (serviceStatus.webuiHealth !== 'ready' || !onboardingStatus) {
    return {
      id: 'sidekick-ready',
      label: 'Sidekick ready',
      detail: 'The local runtime has started. Lastbrowser is loading setup details.',
      canSubmit: false
    };
  }

  if (onboardingStatus.system?.chat_ready === true) {
    return {
      id: 'ready',
      label: 'Ready',
      detail: 'Sidekick is connected and ready inside the browser.',
      canSubmit: true
    };
  }

  return {
    id: 'provider-needed',
    label: 'Provider needed',
    detail: 'Choose a cloud provider and model while the browser remains available.',
    canSubmit: true
  };
}

export function canSubmitCloudSetup(status: FirstRunStatus): boolean {
  return status.canSubmit;
}

export type ProviderOption = {
  id: string;
  label: string;
  /** Provider supports an OAuth/CLI connect flow (Claude Code, Gemini CLI). */
  oauthProvider?: string;
  oauthLabel?: string;
  /** Provider works without an API key (local Ollama, LM Studio). */
  keyOptional?: boolean;
  requiresBaseUrl?: boolean;
  defaultBaseUrl?: string;
};

/**
 * Providers offered in the first-run wizard.
 *
 * The live Sidekick onboarding API already returns the authoritative list
 * (including `oauth_provider` for Claude Code / Gemini CLI and `key_optional`
 * for local Ollama). We surface that list as-is instead of filtering it down:
 * local and key-optional providers are legitimate choices, not noise.
 */
export function cloudProviderOptions(status: OnboardingStatus | null | undefined): ProviderOption[] {
  const providers = status?.setup?.providers?.length ? status.setup.providers : null;
  const codexFallback = fallbackCloudProviders[0];
  const mergedProviders: OnboardingProvider[] = providers
    ? [
      ...(providers.some((provider) => provider.id === codexFallback.id) ? [] : [codexFallback]),
      ...providers
    ]
    : fallbackCloudProviders;
  return mergedProviders
    .filter((provider) => Boolean(String(provider.id || '').trim()))
    .map((provider) => ({
      id: String(provider.id).trim(),
      label: String(provider.label || provider.id).trim(),
      oauthProvider: provider.oauth_provider ? String(provider.oauth_provider).trim() : undefined,
      oauthLabel: provider.oauth_label ? String(provider.oauth_label).trim() : undefined,
      keyOptional: provider.key_optional === true,
      requiresBaseUrl: provider.requires_base_url === true,
      defaultBaseUrl: provider.default_base_url ? String(provider.default_base_url).trim() : undefined
    }));
}

export function providerOption(
  status: OnboardingStatus | null | undefined,
  providerId: string
): ProviderOption | undefined {
  return cloudProviderOptions(status).find((option) => option.id === providerId);
}

export function modelsForProvider(status: OnboardingStatus | null | undefined, providerId: string): Array<{ id: string; label: string }> {
  const provider = status?.setup?.providers?.find((item) => item.id === providerId);
  const models = provider?.models || [];
  const normalized = models
    .map((model) => {
      if (typeof model === 'string') return { id: model, label: model };
      const id = String(model.id || model.value || '').trim();
      return id ? { id, label: String(model.label || id).trim() } : null;
    })
    .filter((item): item is { id: string; label: string } => Boolean(item));
  return normalized.length ? normalized : (fallbackModelsByProvider[providerId] || []);
}
