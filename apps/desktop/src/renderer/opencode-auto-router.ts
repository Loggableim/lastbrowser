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

const SCOUT_PREFERENCE = ['glm-5.3-flash', 'deepseek-v4.1-flash'];
const STRONG_PREFERENCE = ['deepseek-v4.1-flash', 'glm-5.3-flash'];
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

function freeOpenCode(models: readonly FreeModel[]): FreeModel[] {
  return models.filter(model => /^opencode(?:[-_]|$)/i.test(model.provider) && model.model.trim());
}

function pick(models: readonly FreeModel[], preference: readonly string[], avoid?: FreeModel | null): FreeModel | null {
  const pool = models.filter(model => !avoid || model.provider !== avoid.provider || model.model !== avoid.model);
  for (const id of preference) {
    const found = pool.find(model => model.model === id);
    if (found) return found;
  }
  return pool[0] ?? null;
}

export function planOpenCodeAutoRoute(input: {
  text: string;
  pageContext?: string;
  freeModels: readonly FreeModel[];
  enabled: boolean;
}): AutoRouterPlan {
  const classification = classifyAutoRouterPrompt(input);
  if (!input.enabled) return { enabled: false, classification, scout: null, strong: null, action: 'disabled' };
  const free = freeOpenCode(input.freeModels);
  const scout = pick(free, SCOUT_PREFERENCE);
  const strong = pick(free, STRONG_PREFERENCE, scout) ?? scout;
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
