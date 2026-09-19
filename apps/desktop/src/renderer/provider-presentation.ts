/**
 * Presentation metadata for the first-run provider picker.
 *
 * The onboarding API supplies the authoritative provider list (ids, labels,
 * OAuth info). This module adds the human-facing layer: a short explanation,
 * a category, and a brand mark so the wizard reads as a guided choice instead
 * of a bare dropdown.
 */

export type ProviderCategory = 'connect' | 'cloud' | 'local';

export type ProviderPresentation = {
  /** Short line explaining what this provider gives the user. */
  description: string;
  category: ProviderCategory;
  /** Emoji or short glyph used as the brand mark. */
  mark: string;
  /** Accent color for the mark background. */
  color: string;
  /** Optional note shown under the API key field. */
  keyHint?: string;
};

const PRESENTATION: Record<string, ProviderPresentation> = {
  'openai-codex': {
    description: 'Sign in with your ChatGPT account — no API key needed.',
    category: 'connect',
    mark: '⌘',
    color: '#10a37f'
  },
  anthropic: {
    description: 'Connect Claude Code, or paste an Anthropic API key.',
    category: 'connect',
    mark: '✳',
    color: '#d97757'
  },
  'google-gemini-cli': {
    description: 'Sign in with your Google account — no API key needed.',
    category: 'connect',
    mark: '✦',
    color: '#4285f4'
  },
  openai: {
    description: 'OpenAI API key for GPT models.',
    category: 'cloud',
    mark: '⌘',
    color: '#10a37f'
  },
  openrouter: {
    description: 'One key for 200+ models from many vendors.',
    category: 'cloud',
    mark: '⇄',
    color: '#6366f1'
  },
  gemini: {
    description: 'Google AI Studio API key for Gemini models.',
    category: 'cloud',
    mark: '✦',
    color: '#4285f4'
  },
  deepseek: {
    description: 'DeepSeek API key for their reasoning models.',
    category: 'cloud',
    mark: '◈',
    color: '#4d6bfe'
  },
  mistralai: {
    description: 'Mistral API key for European-hosted models.',
    category: 'cloud',
    mark: '▲',
    color: '#ff7000'
  },
  nvidia: {
    description: 'NVIDIA NIM endpoints for Nemotron and others.',
    category: 'cloud',
    mark: '◉',
    color: '#76b900'
  },
  xiaomi: {
    description: 'Xiaomi MiMo API key.',
    category: 'cloud',
    mark: '◐',
    color: '#ff6900'
  },
  zai: {
    description: 'Z.AI / GLM API key.',
    category: 'cloud',
    mark: '智',
    color: '#3859ff'
  },
  'x-ai': {
    description: 'xAI API key for Grok models.',
    category: 'cloud',
    mark: '𝕏',
    color: '#000000'
  },
  ollama: {
    description: 'Run models locally, or use Ollama Cloud with a key.',
    category: 'local',
    mark: '🦙',
    color: '#000000',
    keyHint: 'Leave empty for a local Ollama. Paste an Ollama Cloud key to use hosted models.'
  },
  lmstudio: {
    description: 'Connect to a local LM Studio server.',
    category: 'local',
    mark: '▣',
    color: '#7c3aed',
    keyHint: 'Leave empty for a local LM Studio server.'
  },
  custom: {
    description: 'Any OpenAI-compatible endpoint (vLLM, llama.cpp, …).',
    category: 'local',
    mark: '⚙',
    color: '#64748b',
    keyHint: 'Provide the base URL of your endpoint. A key is optional for local servers.'
  }
};

const FALLBACK: ProviderPresentation = {
  description: 'Connect this provider to Sidekick.',
  category: 'cloud',
  mark: '•',
  color: '#64748b'
};

export function providerPresentation(providerId: string): ProviderPresentation {
  return PRESENTATION[providerId] || FALLBACK;
}

export const categoryLabels: Record<ProviderCategory, { title: string; hint: string }> = {
  connect: {
    title: 'Connect an account',
    hint: 'Sign in with an existing subscription — no API key to manage.'
  },
  cloud: {
    title: 'Use an API key',
    hint: 'Paste a key from a cloud provider.'
  },
  local: {
    title: 'Run locally',
    hint: 'Point Sidekick at a model server on this machine or your network.'
  }
};
