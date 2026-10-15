import { isDefaultFreeRouterModel, type FreeModel } from './opencode-auto-router.js';

export const ROUTER_SETTINGS_KEY = 'lastbrowser.routerSettings.v1';

export type RouterBenchRow = Readonly<{
  provider: string;
  model: string;
  paid: boolean;
  pricePer1kUsd: number | null;
  medianMs: number | null;
  p90Ms: number | null;
  classificationHit: number | null;
  failureRate: number | null;
  speedRating: number;
  qualityRating: number;
  priceRating: number;
  score: number;
  timingSource: 'box' | 'local';
}>;

export type RouterSettings = Readonly<{ enabled: boolean; order: readonly FreeModel[] }>;

export const DEFAULT_ROUTER_ORDER: readonly FreeModel[] = [
  { provider: 'opencode', model: 'cat-jam-free' },
  { provider: 'opencode', model: 'space-bunny-free' },
  { provider: 'opencode-go', model: 'cat-jam-free' }
];

export const ROUTER_BENCH_QUESTIONS = [
  { id: 'simple', text: 'What is 2+2?', expect: 'simple' as const },
  { id: 'code', text: 'Refactor this function\n```\nfunction add(){return 1}\n```', expect: 'complex' as const },
  { id: 'keyword', text: 'Please debug this migration', expect: 'complex' as const }
];

function rate(medianMs: number | null, classificationHit: number | null, paid: boolean, failureRate: number | null) {
  const speedRating = medianMs == null ? 0 : Math.max(0, Math.min(10, Math.round((12000 - medianMs) / 800)));
  const qualityRating = classificationHit == null ? 0 : Math.round(classificationHit * 10);
  const priceRating = paid ? 2 : 10;
  const score = Math.max(0, Math.round((speedRating * 0.45 + qualityRating * 0.45 + priceRating * 0.1 - (failureRate ?? 0) * 10) * 10) / 10);
  return { speedRating, qualityRating, priceRating, score };
}

function benchRow(provider: string, model: string, paid: boolean, pricePer1kUsd: number | null, medianMs: number | null, p90Ms: number | null, classificationHit: number | null, failureRate: number | null, timingSource: 'box' | 'local'): RouterBenchRow {
  return { provider, model, paid, pricePer1kUsd, medianMs, p90Ms, classificationHit, failureRate, timingSource, ...rate(medianMs, classificationHit, paid, failureRate) };
}

/** Box benchmark, 10 questions per model. Paid rows stay visible and out of the automatic order. */
export const ROUTER_BENCH_SEED: readonly RouterBenchRow[] = [
  benchRow('opencode', 'cat-jam-free', false, null, 4500, 7300, 0.7, 0, 'box'),
  benchRow('opencode', 'space-bunny-free', false, null, 4200, 6500, 0.6, 0, 'box'),
  benchRow('opencode-go', 'cat-jam-free', false, null, 6100, null, 0.8, 0, 'box'),
  benchRow('opencode-go', 'deepseek-v4.1-flash', true, 0.08, 9000, null, 1, 0, 'box'),
  benchRow('opencode', 'deepseek-v4.1-flash-free', false, null, null, null, null, 1, 'box'),
  benchRow('opencode', 'muse-spark-free', false, null, null, null, null, 1, 'box')
];

export function readRouterSettings(raw: string | null): RouterSettings {
  if (!raw) return { enabled: true, order: DEFAULT_ROUTER_ORDER };
  try {
    const parsed = JSON.parse(raw) as { enabled?: boolean; order?: FreeModel[] };
    const order = Array.isArray(parsed.order) ? parsed.order.filter(isDefaultFreeRouterModel) : [];
    return { enabled: parsed.enabled !== false, order: order.length ? order : DEFAULT_ROUTER_ORDER };
  } catch {
    return { enabled: true, order: DEFAULT_ROUTER_ORDER };
  }
}

export function writeRouterSettings(settings: RouterSettings): string {
  return JSON.stringify({ enabled: settings.enabled, order: settings.order.filter(isDefaultFreeRouterModel) });
}

export function suggestRouterOrder(rows: readonly RouterBenchRow[]): FreeModel[] {
  return rows.filter(entry => !entry.paid && isDefaultFreeRouterModel(entry) && (entry.failureRate ?? 0) < 1)
    .slice()
    .sort((a, b) => b.score - a.score || (a.medianMs ?? 99999) - (b.medianMs ?? 99999))
    .map(entry => ({ provider: entry.provider, model: entry.model }));
}

export function measureRouterSelection(selected: readonly FreeModel[], classify: (text: string) => 'simple' | 'complex', cached: readonly RouterBenchRow[] = ROUTER_BENCH_SEED): RouterBenchRow[] {
  return selected.filter(isDefaultFreeRouterModel).map(model => {
    let hits = 0;
    for (const question of ROUTER_BENCH_QUESTIONS) if (classify(question.text) === question.expect) hits += 1;
    const prior = cached.find(entry => entry.provider === model.provider && entry.model === model.model);
    return benchRow(model.provider, model.model, false, null, prior?.medianMs ?? null, prior?.p90Ms ?? null, hits / ROUTER_BENCH_QUESTIONS.length, 0, prior?.medianMs != null ? 'box' : 'local');
  });
}
