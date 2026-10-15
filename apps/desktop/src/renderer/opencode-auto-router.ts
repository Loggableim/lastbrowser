/** OpenCode Auto prototype. Default off. Not part of the beta.10 gate. */

export type AutoRouterClass = 'simple' | 'complex';
export type FreeModel = Readonly<{ provider: string; model: string }>;
export type AutoRouterClassification = Readonly<{ kind: AutoRouterClass; score: number; reasons: readonly string[] }>;
export type AutoRouterPlan = Readonly<{
  enabled: boolean;
  classification: AutoRouterClassification;
  scout: FreeModel | null;
  strong: FreeModel | null;
  action: 'disabled' | 'scout-only' | 'handoff';
}>;

const SCOUT_PREFERENCE: readonly FreeModel[] = [
  { provider: 'opencode', model: 'cat-jam-free' },
  { provider: 'opencode', model: 'space-bunny-free' },
  { provider: 'opencode-go', model: 'cat-jam-free' }
];
const DENIED = new Set(['opencode/deepseek-v4.1-flash-free', 'opencode-go/deepseek-v4.1-flash']);
const COMPLEX_KEYWORD = /\b(refactor|debug|implement|architecture|migration|stacktrace|compare|analysiere|architektur|beweis|schritt)\b/i;
const CODE_MARK = /```|\bfunction\b|\bclass\b|\bimport\b|\bdef\b/;

export function opencodeAutoRouterEnabled(env: { flag?: string | null; stored?: string | null }): boolean {
  return env.flag === '1' || env.stored === '1';
}

export function classifyAutoRouterPrompt(input: { text: string; pageContext?: string }): AutoRouterClassification {
  const text = input.text.trim();
  const page = (input.pageContext || '').trim();
  const reasons: string[] = [];
  let score = text.length / 200;
  if (text.length > 600) reasons.push('length');
  if (CODE_MARK.test(text)) { score += 3; reasons.push('code'); }
  if (COMPLEX_KEYWORD.test(text)) { score += 2; reasons.push('keyword'); }
  if (page.length > 1500) { score += page.length / 1500; reasons.push('page-context'); }
  const kind: AutoRouterClass = reasons.length > 0 || score >= 3 ? 'complex' : 'simple';
  return { kind, score: Math.round(score * 10) / 10, reasons };
}

function modelKey(model: FreeModel): string {
  return `${model.provider}/${model.model}`.toLowerCase();
}

function normalizeFreeModel(model: FreeModel): FreeModel {
  const name = model.model.includes('/') ? model.model.slice(model.model.lastIndexOf('/') + 1) : model.model;
  return { provider: model.provider.trim(), model: name.trim() };
}

export function isDefaultFreeRouterModel(model: FreeModel): boolean {
  const normalized = normalizeFreeModel(model);
  const key = modelKey(normalized);
  if (!/^opencode(?:-go)?$/i.test(normalized.provider) || !normalized.model.toLowerCase().endsWith('-free')) return false;
  if (DENIED.has(key) || normalized.model.toLowerCase().includes('muse-spark')) return false;
  return true;
}

function freeOpenCode(models: readonly FreeModel[]): FreeModel[] {
  return models.map(normalizeFreeModel).filter(isDefaultFreeRouterModel);
}

function sameModel(left: FreeModel, right: FreeModel): boolean {
  return left.provider.toLowerCase() === right.provider.toLowerCase() && left.model.toLowerCase() === right.model.toLowerCase();
}

function pick(models: readonly FreeModel[], preference: readonly FreeModel[], avoid: FreeModel | null, fallback: 'any' | 'other'): FreeModel | null {
  const pool = models.filter(model => !avoid || !sameModel(model, avoid));
  for (const preferred of preference) {
    const found = pool.find(model => sameModel(model, preferred));
    if (found) return found;
  }
  if (fallback === 'any') return pool[0] ?? null;
  return pool.find(model => !SCOUT_PREFERENCE.some(preferred => sameModel(model, preferred))) ?? null;
}

export type ModelClassJudgment = 'simple' | 'complex' | 'uncertain' | null;

/** Heuristic plus the scout's own class. A missing judgment keeps the heuristic. Doubt is complex. */
export function combineAutoRouterClass(heuristic: AutoRouterClass, modelJudgment: ModelClassJudgment): AutoRouterClass {
  if (heuristic === 'complex' || modelJudgment === 'complex' || modelJudgment === 'uncertain') return 'complex';
  return 'simple';
}

export function readScoutClass(text: string): ModelClassJudgment {
  const match = text.match(/\{[^{}]*"class"\s*:\s*"(simple|complex|uncertain)"[^{}]*\}/i);
  if (!match) return null;
  const value = match[1].toLowerCase();
  return value === 'simple' || value === 'complex' || value === 'uncertain' ? value : 'uncertain';
}

export function planOpenCodeAutoRoute(input: {
  text: string;
  pageContext?: string;
  freeModels: readonly FreeModel[];
  enabled: boolean;
  modelJudgment?: ModelClassJudgment;
  order?: readonly FreeModel[];
}): AutoRouterPlan {
  const heuristic = classifyAutoRouterPrompt(input);
  const kind = combineAutoRouterClass(heuristic.kind, input.modelJudgment ?? null);
  const classification = { ...heuristic, kind, reasons: input.modelJudgment && input.modelJudgment !== 'simple' ? [...heuristic.reasons, `model:${input.modelJudgment}`] : heuristic.reasons };
  if (!input.enabled) return { enabled: false, classification, scout: null, strong: null, action: 'disabled' };
  const free = freeOpenCode(input.freeModels);
  const preferred = (input.order ?? []).map(normalizeFreeModel).filter(isDefaultFreeRouterModel);
  const scout = pick(free, preferred.length ? preferred : SCOUT_PREFERENCE, null, 'any');
  const strong = pick(free, [], scout, 'other');
  if (!scout) return { enabled: true, classification, scout: null, strong: null, action: 'disabled' };
  if (classification.kind === 'simple' || !strong || (strong.provider === scout.provider && strong.model === scout.model)) {
    return { enabled: true, classification, scout, strong: null, action: 'scout-only' };
  }
  return { enabled: true, classification, scout, strong, action: 'handoff' };
}

export function mergeAutoRouterTranscript(scoutText: string, strongText: string, kind: AutoRouterClass): string {
  if (kind === 'simple') return scoutText;
  const scout = scoutText.trim();
  const strong = strongText.trim();
  if (!strong) return scoutText;
  if (scout && strong.startsWith(scout)) return strongText;
  return `${scoutText}${strongText}`;
}

export function listFreeOpenCodeModels(groups: readonly { provider_id?: string; providerId?: string; configured?: boolean; models?: readonly { id?: string }[] }[]): FreeModel[] {
  const models: FreeModel[] = [];
  for (const group of groups) {
    const provider = String(group.provider_id || group.providerId || '');
    if (!/^opencode(?:[-_]|$)/i.test(provider) || group.configured === false) continue;
    for (const entry of group.models || []) {
      const raw = String(entry.id || '').trim();
      const model = raw.includes(':') ? raw.slice(raw.lastIndexOf(':') + 1) : raw;
      if (model) models.push({ provider, model });
    }
  }
  return models;
}

/** Null keeps the caller's model. An explicit pick is never replaced. */
export function resolveAutoRouterSend(input: {
  enabled: boolean;
  explicitModel: boolean;
  text: string;
  pageContext?: string;
  freeModels: readonly FreeModel[];
  routingEnabled?: boolean;
  order?: readonly FreeModel[];
}): { model: string; provider: string; plan: AutoRouterPlan } | null {
  if (!input.enabled || input.explicitModel || input.routingEnabled === false) return null;
  const plan = planOpenCodeAutoRoute(input);
  if (!plan.scout || plan.action === 'disabled') return null;
  return { model: plan.scout.model, provider: plan.scout.provider, plan };
}

export function logOpenCodeAutoRouter(point: Record<string, unknown>): void {
  console.info(`OPENCODE_AUTO_ROUTER ${JSON.stringify({ ...point, at: new Date().toISOString() })}`);
}

export function previewAutoRouter(plan: AutoRouterPlan, lanes: {
  scout: () => { text: string; cancel: () => void };
  strong: () => { text: string; cancel: () => void };
}): { text: string; strongCancelled: boolean; lanesStarted: number; action: AutoRouterPlan['action'] } {
  if (plan.action !== 'scout-only' && plan.action !== 'handoff') {
    return { text: '', strongCancelled: false, lanesStarted: 0, action: plan.action };
  }
  const scout = lanes.scout();
  if (plan.action === 'scout-only') {
    return { text: scout.text, strongCancelled: true, lanesStarted: 1, action: plan.action };
  }
  const strong = lanes.strong();
  return {
    text: mergeAutoRouterTranscript(scout.text, strong.text, 'complex'),
    strongCancelled: false,
    lanesStarted: 2,
    action: plan.action
  };
}
