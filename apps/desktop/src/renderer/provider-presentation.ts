/**
 * Presentation metadata for the first-run provider picker.
 *
 * The onboarding API supplies the authoritative provider list (ids, labels,
 * OAuth info). This module adds the human-facing layer: a short explanation,
 * a category, and a brand mark so the wizard reads as a guided choice instead
 * of a bare dropdown.
 */

export type ProviderCategory = 'connect' | 'cloud' | 'local';
export type ProviderDeployment = 'local' | 'cloud' | 'remote' | 'unknown';

export function providerDeployment(providerId: string, endpoint?: string, deployment?: string): ProviderDeployment {
  const id = providerId.trim().toLowerCase().replace(/[_\s]+/g, '-');
  if (id === 'ollama-cloud') return 'cloud';
  if (endpoint) {
    try {
      const url = new URL(endpoint);
      const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
      if (!['http:', 'https:'].includes(url.protocol)) return 'unknown';
      if (host === 'localhost' || host === '::1' || /^127(?:\.\d{1,3}){3}$/.test(host)) return 'local';
      if (host === 'ollama.com' || host === 'www.ollama.com') return 'cloud';
      return 'remote';
    } catch { return 'unknown'; }
  }
  if (['local', 'cloud', 'remote', 'unknown'].includes(deployment || '')) return deployment as ProviderDeployment;
  if (['ollama', 'lmstudio', 'lm-studio'].includes(id)) return 'local';
  if (['custom', 'localai', 'local-ai'].includes(id) || id.startsWith('custom:')) return 'unknown';
  return 'cloud';
}

/** Hosting labels describe the endpoint, not the model vendor or brand. */
export function providerHostingLabel(providerId: string, fallback: string, deployment?: string): string {
  const id = providerId.trim().toLowerCase().replace(/[_\s]+/g, '-');
  const hosting = providerDeployment(id, undefined, deployment);
  if (id === 'ollama-cloud') return 'Ollama Cloud';
  const brand = id === 'ollama' ? 'Ollama' : ['localai', 'local-ai'].includes(id) ? 'LocalAI' : fallback;
  if (['ollama', 'localai', 'local-ai', 'lmstudio', 'lm-studio', 'custom'].includes(id) || id.startsWith('custom:')) {
    return `${brand} · ${hosting === 'local' ? 'Local' : hosting === 'cloud' ? 'Cloud' : hosting === 'remote' ? 'Remote' : 'Endpoint'}`;
  }
  return fallback;
}

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
  'opencode-go': { description: 'Connect OpenCode Go and choose from your available models.', category: 'cloud', mark: '⌘', color: '#18181b' },
  'opencode-zen': { description: 'Connect OpenCode Zen and choose from your available models.', category: 'cloud', mark: '⌘', color: '#18181b' },
  anthropic: {
    description: 'Connect Claude Code, or paste an Anthropic API key.',
    category: 'connect',
    mark: '✳',
    color: '#d97757'
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
  alibaba: {
    description: 'Alibaba Cloud DashScope workspace and live model catalog.',
    category: 'cloud',
    mark: '阿',
    color: '#ff6a00',
    keyHint: 'Workspace endpoint and model calls may be billable.'
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
    description: 'Connect an Ollama server. Only loopback endpoints run on this computer.',
    category: 'local',
    mark: '🦙',
    color: '#000000',
    keyHint: 'A key is optional for a local server. Choose Ollama Cloud for hosted models.'
  },
  'ollama-cloud': {
    description: 'Hosted Ollama models. Requests are sent to Ollama Cloud.', category: 'cloud', mark: '🦙', color: '#000000',
    keyHint: 'Use your Ollama Cloud credentials.'
  },
  localai: { description: 'Connect a LocalAI endpoint.', category: 'cloud', mark: '⌂', color: '#596b8a' },
  'local-ai': { description: 'Connect a LocalAI endpoint.', category: 'cloud', mark: '⌂', color: '#596b8a' },
  lmstudio: {
    description: 'Connect to a local LM Studio server.',
    category: 'local',
    mark: '▣',
    color: '#7c3aed',
    keyHint: 'Leave empty for a local LM Studio server.'
  },
  custom: {
    description: 'Any OpenAI-compatible endpoint (vLLM, llama.cpp, …).',
    category: 'cloud',
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

export function providerPresentation(providerId: string, endpoint?: string, deployment?: string): ProviderPresentation {
  const id = providerId.trim().toLowerCase().replace(/[_\s]+/g, '-');
  const presentation = PRESENTATION[id] || FALLBACK;
  const hosting = providerDeployment(id, endpoint, deployment);
  return { ...presentation, category: hosting === 'local' ? 'local' : presentation.category === 'connect' && !endpoint ? 'connect' : 'cloud' };
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
    hint: 'Use a model endpoint running on this computer.'
  }
};

/**
 * Short, honest descriptions for the models the wizard offers.
 *
 * The onboarding API returns ids and labels only, so the picker would show a
 * bare list. These notes let a new user compare options without leaving the
 * wizard. Keys are matched by substring against the model id, longest first.
 */
export type ModelNote = {
  /** What this model is good at. */
  summary: string;
  /** Rough cost/speed class shown as a badge. */
  tier: 'fast' | 'balanced' | 'powerful' | 'local';
  /** Optional caveat worth knowing before choosing. */
  caveat?: string;
};

const MODEL_NOTES: Array<[string, ModelNote]> = [
  // OpenAI / Codex
  ['gpt-5.5-mini', { summary: 'Cheap and quick for everyday chat and short tasks.', tier: 'fast' }],
  ['gpt-5.5', { summary: 'Strong general reasoning; the safest default for mixed work.', tier: 'powerful' }],
  ['gpt-5.4-mini', { summary: 'Lightweight GPT-5.4 — good for high-volume simple turns.', tier: 'fast' }],
  ['gpt-5.4', { summary: 'Balanced GPT-5.4 for coding and analysis.', tier: 'balanced' }],
  ['gpt-5.3-codex', { summary: 'Tuned for code: refactors, tests, multi-file edits.', tier: 'powerful' }],
  ['gpt-5.2-codex', { summary: 'Earlier Codex generation; still strong for code.', tier: 'balanced' }],
  ['codex-mini', { summary: 'Smallest Codex variant — fast code answers, less depth.', tier: 'fast' }],
  // Anthropic
  ['claude-opus-4.7', { summary: 'Anthropic’s most capable model; best for hard reasoning.', tier: 'powerful', caveat: 'Slowest and most expensive option.' }],
  ['claude-opus-4.6', { summary: 'Previous flagship — near-top quality, slightly cheaper.', tier: 'powerful' }],
  ['claude-sonnet-4.6', { summary: 'Best quality-per-cost for coding and long context.', tier: 'balanced' }],
  ['claude-sonnet-4-5', { summary: 'Reliable all-rounder from the previous generation.', tier: 'balanced' }],
  // Google
  ['gemini-2.5-flash', { summary: 'Google’s flagship Flash; ultra-fast with high accuracy, deep reasoning and 1M context.', tier: 'fast' }],
  ['gemini-2.5-pro', { summary: 'Advanced reasoning, deep comprehension and huge context.', tier: 'powerful' }],
  ['gemini-2.5-flash-lite', { summary: 'Ultra-light, fastest Gemini for rapid responses.', tier: 'fast' }],
  ['gemini-2.0-flash', { summary: 'Reliable, high-speed multi-modal everyday model.', tier: 'fast' }],
  ['gemini-1.5-pro', { summary: 'Long-context reasoning model from Gemini 1.5 generation.', tier: 'powerful' }],
  ['gemini-1.5-flash', { summary: 'Lightweight high-speed model from Gemini 1.5 generation.', tier: 'fast' }],
  // Others
  ['deepseek-reasoner', { summary: 'DeepSeek-R1 reasoning model; outstanding complex problem solving.', tier: 'powerful' }],
  ['deepseek-chat', { summary: 'DeepSeek-V3 general assistant; fast, versatile and inexpensive.', tier: 'balanced' }],
  ['deepseek', { summary: 'Strong reasoning at low cost; popular for code.', tier: 'balanced' }],
  ['mimo', { summary: 'Xiaomi’s model — inexpensive general chat.', tier: 'fast' }],
  ['glm', { summary: 'Z.AI GLM — solid multilingual reasoning.', tier: 'balanced' }],
  ['grok', { summary: 'xAI Grok — current-events flavored chat.', tier: 'balanced' }],
  ['mistral', { summary: 'European-hosted models; good latency in the EU.', tier: 'balanced' }],
  ['nemotron', { summary: 'NVIDIA Nemotron — optimized for NIM endpoints.', tier: 'balanced' }],
  ['qwen', { summary: 'Qwen — strong multilingual and coding ability.', tier: 'balanced' }],
  ['llama', { summary: 'Meta Llama — widely used open-weight family.', tier: 'balanced' }],
  ['claude', { summary: 'Anthropic Claude model.', tier: 'balanced' }],
  ['gpt-', { summary: 'OpenAI GPT model.', tier: 'balanced' }],
  ['gemini', { summary: 'Google Gemini model.', tier: 'balanced' }]
];

export function modelNote(modelId: string): ModelNote | null {
  const id = modelId.toLowerCase();
  for (const [needle, note] of MODEL_NOTES) {
    if (id.includes(needle)) return note;
  }
  return null;
}

export const tierLabels: Record<ModelNote['tier'], string> = {
  fast: 'fast',
  balanced: 'balanced',
  powerful: 'most capable',
  local: 'local'
};

export type ProviderRecommendation = {
  id: string;
  badge: string;
  badgeType: 'recommended' | 'popular' | 'private' | 'power';
  headline: string;
  benefits: string[];
  bestFor: string;
  actionPrompt: string;
};

export const RECOMMENDED_PROVIDER_IDS = ['openai-codex', 'opencode-go'] as const;

export const PROVIDER_RECOMMENDATIONS: Record<string, ProviderRecommendation> = {
  "opencode-go": {"id": "opencode-go", "badge": "Empfohlen", "badgeType": "recommended", "headline": "OpenCode Go", "benefits": ["Modelle aus dem verfügbaren Katalog deines Kontos wählen"], "bestFor": "Für Modelle aus deinem verbundenen Konto", "actionPrompt": "OpenCode Go verbinden"},
  "opencode-zen": {"id": "opencode-zen", "badge": "Beta", "badgeType": "power", "headline": "OpenCode Zen", "benefits": ["Modelle aus dem verfügbaren Katalog deines Kontos wählen"], "bestFor": "Für Modelle aus deinem verbundenen Konto", "actionPrompt": "OpenCode Zen verbinden"},
  "xiaomi": {"id": "xiaomi", "badge": "Beta", "badgeType": "power", "headline": "Xiaomi MiMo", "benefits": ["Modelle aus dem verfügbaren Katalog deines Kontos wählen"], "bestFor": "Für Modelle aus deinem verbundenen Konto", "actionPrompt": "Xiaomi MiMo verbinden"},

  'openai-codex': {
    id: 'openai-codex',
    badge: 'Empfohlen • ChatGPT-Konto',
    badgeType: 'recommended',
    headline: 'ChatGPT / OpenAI (Bestehendes Abo nutzen)',
    benefits: [
      'Nutze dein vorhandenes ChatGPT Plus-, Team- oder Enterprise-Abonnement',
      'Wähle ein Modell aus dem verfügbaren Katalog deines Kontos',
      'Modelle und Nutzungslimits richten sich nach deinem Zugang',
      'Sicherer Device-Login ohne Passworteingabe in der App'
    ],
    bestFor: 'Ideal, wenn du bereits ein monatliches ChatGPT-Abo nutzt',
    actionPrompt: 'Mit ChatGPT anmelden'
  },
  ollama: {
    id: 'ollama',
    badge: '100% Privat • Lokal auf deinem PC',
    badgeType: 'private',
    headline: 'Ollama (Lokale Open-Source KI)',
    benefits: [
      '100% Offline-Privatsphäre: Keine Daten verlassen deinen Computer',
      'Funktioniert offline und komplett ohne Internetverbindung',
      '100% kostenlos ohne Limits oder Account-Pflicht',
      'Unterstützt Llama 3.3, DeepSeek-R1, Mistral und Qwen 2.5'
    ],
    bestFor: 'Für maximale Privatsphäre, Offline-Arbeit und Entwickler',
    actionPrompt: 'Ollama lokal verbinden'
  },
  openrouter: {
    id: 'openrouter',
    badge: 'Viele Anbieter • Ein API-Key',
    badgeType: 'power',
    headline: 'OpenRouter (Modelle verschiedener Anbieter)',
    benefits: [
      'Ein OpenRouter-Key für zahlreiche aktuelle Modellanbieter',
      'Live-Modellkatalog mit Verfügbarkeit und Kostenangaben',
      'Modell beim Einrichten direkt auswählen'
    ],
    bestFor: 'Wenn du mehrere Anbieter über einen Zugang nutzen willst',
    actionPrompt: 'OpenRouter-Key eingeben'
  },
  alibaba: {
    id: 'alibaba',
    badge: 'Alibaba Cloud • DashScope',
    badgeType: 'power',
    headline: 'Alibaba Cloud DashScope',
    benefits: [
      'Workspace-spezifischer OpenAI-kompatibler Modellzugriff',
      'Live-Modellkatalog aus deinem Alibaba-Cloud-Workspace',
      'Modell beim Einrichten direkt auswählen'
    ],
    bestFor: 'Wenn du Modelle über Alibaba Cloud Model Studio nutzen möchtest',
    actionPrompt: 'DashScope-Schlüssel eingeben'
  }
};

export type PersonalityProfile = {
  id: string;
  name: string;
  tagline: string;
  description: string;
  badge: string;
  badgeType: 'recommended' | 'precision' | 'code' | 'creative' | 'mentor';
  icon: string;
  tone: string;
  samplePhrase: string;
};

export const PERSONALITY_PROFILES: PersonalityProfile[] = [
  {
    id: 'nova',
    name: 'Nova (Standard)',
    tagline: 'Direkt & Proaktiv',
    description: 'Pragmatisch, lösungsorientiert und faktenbasiert. Packt Aufgaben direkt an ohne unnötiges Vorgeplänkel.',
    badge: 'Empfohlen',
    badgeType: 'recommended',
    icon: '✨',
    tone: 'Direkt & Ausgewogen',
    samplePhrase: '„Hier ist das konkrete Ergebnis samt der relevanten Fakten.“'
  },
  {
    id: 'analytical',
    name: 'Orion · Analyst & Forscher',
    tagline: 'Präzise & Akademisch',
    description: 'Tiefgründig, methodisch und strukturiert. Nennt Quellen, wägt Vor- und Nachteile ab und prüft Annahmen gründlich.',
    badge: 'Exakt',
    badgeType: 'precision',
    icon: '🔬',
    tone: 'Wissenschaftlich & Gründlich',
    samplePhrase: '„Die Evidenz zeigt folgende Muster; hier sind die Metriken dazu.“'
  },
  {
    id: 'developer',
    name: 'Patch · Coder',
    tagline: 'Code & Architektur',
    description: 'Minimaler Text, sauber formatierter Code, Best Practices, CLI-Befehle und pragmatische Problemlösung.',
    badge: 'Code-Fokus',
    badgeType: 'code',
    icon: '💻',
    tone: 'Prägnant & Technisch',
    samplePhrase: '„Hier ist der optimierte Patch samt Validierungs-Befehl.“'
  },
  {
    id: 'creative',
    name: 'Spark · Kreativ',
    tagline: 'Kreativ & Out-of-the-Box',
    description: 'Ideenreich, bildhaft und unkonventionell. Eröffnet neue Blickwinkel und findet innovative Ansätze.',
    badge: 'Inspirierend',
    badgeType: 'creative',
    icon: '🎨',
    tone: 'Lebendig & Explorativ',
    samplePhrase: '„Was wäre, wenn wir das umdrehen? Hier sind 3 frische Ideen.“'
  },
  {
    id: 'mentor',
    name: 'Zen · Mentor',
    tagline: 'Geduldig & Erklärend',
    description: 'Schritt-für-Schritt-Anleitungen, warmherzig und pädagogisch wertvoll. Ideal zum Lernen und Verstehen.',
    badge: 'Didaktisch',
    badgeType: 'mentor',
    icon: '🌱',
    tone: 'Warmherzig & Didaktisch',
    samplePhrase: '„Lass uns das Schritt für Schritt gemeinsam durchgehen.“'
  }
];

export const BOT_NAME_PRESETS = [
  { name: 'Nova', desc: 'Modern & KI-nativ' },
  { name: 'Orion', desc: 'Analyst & Forscher' },
  { name: 'Patch', desc: 'Coder' },
  { name: 'Spark', desc: 'Kreativ' },
  { name: 'Zen', desc: 'Mentor' }
];
