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
  ['gemini-3.8-flash', { summary: 'Google’s next-gen flagship Flash; ultra-fast with high accuracy and deep reasoning.', tier: 'fast' }],
  ['gemini-3.1-pro', { summary: 'Google flagship preview; 1M+ context window.', tier: 'powerful' }],
  ['gemini-3-flash', { summary: 'Fast next-gen Gemini with high quality for chat and search.', tier: 'fast' }],
  ['gemini-2.5-flash-lite', { summary: 'Ultra-light, fastest Gemini for rapid responses.', tier: 'fast' }],
  ['gemini-2.5-flash', { summary: 'Flagship speed & accuracy; ideal for everyday browsing & research.', tier: 'fast' }],
  ['gemini-2.5-pro', { summary: 'Advanced reasoning, deep comprehension and huge context.', tier: 'powerful' }],
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

export const PROVIDER_RECOMMENDATIONS: Record<string, ProviderRecommendation> = {
  'google-gemini-cli': {
    id: 'google-gemini-cli',
    badge: 'Empfohlen • Kostenlos mit Google-Konto',
    badgeType: 'recommended',
    headline: 'Google Gemini (Schnell & Riesiges Kontextfenster)',
    benefits: [
      'Kein API-Key oder Kreditkarte nötig – Login direkt mit Google-Konto',
      'Bis zu 1 Million Tokens Kontext – erfasst ganze Websites, PDFs & lange Dokumente',
      'Optimiert für Live-Browsing, Web-Zusammenfassungen und Recherche',
      'Zugriff auf Gemini 3.8 Flash & Gemini Pro'
    ],
    bestFor: 'Beste Wahl für die meisten Nutzer: Sofort startklar ohne Kosten',
    actionPrompt: 'In Lastbrowser mit Google anmelden'
  },
  'openai-codex': {
    id: 'openai-codex',
    badge: 'Beliebt • Mit ChatGPT Plus/Team',
    badgeType: 'popular',
    headline: 'ChatGPT / OpenAI (Bestehendes Abo nutzen)',
    benefits: [
      'Nutze dein vorhandenes ChatGPT Plus-, Team- oder Enterprise-Abonnement',
      'Keine separaten API-Token-Abrechnungen',
      'Zugriff auf GPT-4o und OpenAI Reasoning-Modelle',
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
      'Vollständiger Datenschutz: Keine Daten verlassen deinen Computer',
      'Funktioniert offline und komplett ohne Internetverbindung',
      '100% kostenlos ohne Limits oder Account-Pflicht',
      'Unterstützt Llama 3.3, Mistral, Qwen 2.5 und DeepSeek-R1'
    ],
    bestFor: 'Für maximale Privatsphäre, Offline-Arbeit und Entwickler',
    actionPrompt: 'Ollama lokal verbinden'
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
    name: 'Analyst & Forscher',
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
    name: 'Coder / Hacker',
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
    name: 'Brainstormer',
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
    name: 'Mentor & Begleiter',
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
  { name: 'Sidekick', desc: 'Klassischer Begleiter' },
  { name: 'Hermes', desc: 'Schnell & Agil' },
  { name: 'Aura', desc: 'Ruhig & Fokussiert' }
];
