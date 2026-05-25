export type SetupState = {
  cloudSetupComplete: boolean;
  provider: string;
  model: string;
};

export type OnboardingProvider = {
  id: string;
  label?: string;
  models?: Array<string | { id?: string; value?: string; label?: string }>;
  requires_base_url?: boolean;
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
  { id: 'openai-codex', label: 'OpenAI Codex (ChatGPT)' },
  { id: 'openrouter', label: 'OpenRouter' },
  { id: 'openai', label: 'OpenAI' },
  { id: 'anthropic', label: 'Anthropic' },
  { id: 'gemini', label: 'Google Gemini' }
];

const fallbackModelsByProvider: Record<string, Array<{ id: string; label: string }>> = {
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
    { id: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro Preview' },
    { id: 'gemini-3-flash-preview', label: 'Gemini 3 Flash Preview' },
    { id: 'gemini-3.1-flash-lite-preview', label: 'Gemini 3.1 Flash Lite Preview' },
    { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' }
  ]
};

const localProviderIds = new Set(['lmstudio', 'lm-studio', 'ollama', 'custom', 'local']);

export function normalizeSetupState(raw: unknown): SetupState {
  if (!raw || typeof raw !== 'object') return defaultSetupState;
  const data = raw as Partial<SetupState>;
  return {
    cloudSetupComplete: data.cloudSetupComplete === true,
    provider: String(data.provider || '').trim(),
    model: String(data.model || '').trim()
  };
}

export function isFirstRunRequired(state: SetupState, onboardingStatus: unknown): boolean {
  const status = onboardingStatus as OnboardingStatus | null;
  return state.cloudSetupComplete !== true || status?.system?.chat_ready !== true;
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

export function cloudProviderOptions(status: OnboardingStatus | null | undefined): Array<{ id: string; label: string }> {
  const providers = status?.setup?.providers?.length ? status.setup.providers : null;
  const codexFallback = fallbackCloudProviders[0];
  const mergedProviders: OnboardingProvider[] = providers
    ? [
      ...(providers.some((provider) => provider.id === codexFallback.id) ? [] : [codexFallback]),
      ...providers
    ]
    : fallbackCloudProviders;
  return mergedProviders
    .filter((provider) => {
      const id = String(provider.id || '').trim().toLowerCase();
      if (!id || localProviderIds.has(id)) return false;
      if (provider.key_optional && provider.requires_base_url) return false;
      return true;
    })
    .map((provider) => ({
      id: String(provider.id).trim(),
      label: String(provider.label || provider.id).trim()
    }));
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
