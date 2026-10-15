import { describe, expect, it } from 'vitest';
import { classifyAutoRouterPrompt } from '../src/renderer/opencode-auto-router.js';
import { DEFAULT_ROUTER_ORDER, ROUTER_BENCH_SEED, measureRouterSelection, readRouterSettings, suggestRouterOrder, writeRouterSettings } from '../src/renderer/router-settings.js';

describe('router settings', () => {
  it('starts with auto-routing on and the benchmark default order', () => {
    expect(readRouterSettings(null)).toEqual({ enabled: true, order: DEFAULT_ROUTER_ORDER });
    expect(DEFAULT_ROUTER_ORDER.map(model => `${model.provider}/${model.model}`)).toEqual([
      'opencode/cat-jam-free', 'opencode/space-bunny-free', 'opencode-go/cat-jam-free'
    ]);
  });

  it('keeps paid models visible and out of the suggested order', () => {
    const paid = ROUTER_BENCH_SEED.find(row => row.model === 'deepseek-v4.1-flash');
    expect(paid?.paid).toBe(true);
    expect(paid?.pricePer1kUsd).toBe(0.08);
    expect(suggestRouterOrder(ROUTER_BENCH_SEED).some(model => model.model === 'deepseek-v4.1-flash')).toBe(false);
    expect(suggestRouterOrder(ROUTER_BENCH_SEED).some(model => model.model.includes('muse-spark'))).toBe(false);
  });

  it('suggests a fallback order from a local measurement and applies it in one write', () => {
    const selected = DEFAULT_ROUTER_ORDER;
    const measured = measureRouterSelection(selected, text => classifyAutoRouterPrompt({ text }).kind);
    const suggestion = suggestRouterOrder(measured);
    expect(suggestion.length).toBe(3);
    const stored = writeRouterSettings({ enabled: true, order: suggestion });
    expect(readRouterSettings(stored).order).toEqual(suggestion);
    expect(readRouterSettings(JSON.stringify({ enabled: false, order: suggestion })).enabled).toBe(false);
  });
});
