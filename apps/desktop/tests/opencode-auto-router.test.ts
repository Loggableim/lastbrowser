import { describe, expect, it } from 'vitest';
import { classifyAutoRouterPrompt, listFreeOpenCodeModels, mergeAutoRouterTranscript, opencodeAutoRouterEnabled, planOpenCodeAutoRoute, previewAutoRouter, resolveAutoRouterSend } from '../src/renderer/opencode-auto-router.js';

const free = [
  { provider: 'opencode-go', model: 'glm-5.3-flash' },
  { provider: 'opencode-go', model: 'deepseek-v4.1-flash' },
  { provider: 'openai', model: 'gpt-5' }
];

describe('OpenCode auto router prototype', () => {
  it('stays off unless the flag is set', () => {
    expect(opencodeAutoRouterEnabled({})).toBe(false);
    expect(opencodeAutoRouterEnabled({ flag: '1' })).toBe(true);
    expect(planOpenCodeAutoRoute({ text: 'Hi', freeModels: free, enabled: false }).action).toBe('disabled');
  });

  it('answers a short question with the free scout and does not start the strong lane', () => {
    const plan = planOpenCodeAutoRoute({ text: 'Was ist 2+2?', freeModels: free, enabled: true });
    expect(plan.classification.kind).toBe('simple');
    expect(plan.scout).toEqual({ provider: 'opencode-go', model: 'glm-5.3-flash' });
    expect(plan.action).toBe('scout-only');
    let strongStarted = false;
    const preview = previewAutoRouter(plan, {
      scout: () => ({ text: '4.', cancel: () => undefined }),
      strong: () => { strongStarted = true; return { text: 'no', cancel: () => undefined }; }
    });
    expect(strongStarted).toBe(false);
    expect(preview).toMatchObject({ text: '4.', strongCancelled: true, lanesStarted: 1 });
  });

  it('classifies code and keywords as complex and continues in one transcript', () => {
    const plan = planOpenCodeAutoRoute({ text: 'Please refactor this function\n```\nfunction add(){}\n```', freeModels: free, enabled: true });
    expect(plan.classification.reasons).toEqual(expect.arrayContaining(['code', 'keyword']));
    expect(plan.action).toBe('handoff');
    expect(plan.strong).toEqual({ provider: 'opencode-go', model: 'deepseek-v4.1-flash' });
    const preview = previewAutoRouter(plan, {
      scout: () => ({ text: 'Kurz: die Funktion ist leer. ', cancel: () => undefined }),
      strong: () => ({ text: 'Kurz: die Funktion ist leer. Danach kommt die konkrete Änderung.', cancel: () => undefined })
    });
    expect(preview.lanesStarted).toBe(2);
    expect(preview.text).toBe('Kurz: die Funktion ist leer. Danach kommt die konkrete Änderung.');
    expect(preview.text).not.toContain('\n\n');
  });

  it('keeps paid models out of both lanes', () => {
    const plan = planOpenCodeAutoRoute({ text: 'Hi', freeModels: [{ provider: 'openai', model: 'gpt-5' }], enabled: true });
    expect(plan.scout).toBeNull();
    expect(plan.action).toBe('disabled');
  });

  it('records a measurable classification score', () => {
    const simple = classifyAutoRouterPrompt({ text: 'Hi' });
    const complex = classifyAutoRouterPrompt({ text: 'x'.repeat(700), pageContext: 'y'.repeat(1600) });
    expect(simple.kind).toBe('simple');
    expect(complex.kind).toBe('complex');
    expect(complex.score).toBeGreaterThan(simple.score);
    expect(mergeAutoRouterTranscript('A', 'B', 'simple')).toBe('A');
  });

  it('routes an automatic turn to the free scout and leaves an explicit model alone', () => {
    const sent = resolveAutoRouterSend({ enabled: true, explicitModel: false, text: 'Hi', freeModels: free });
    expect(sent?.model).toBe('glm-5.3-flash');
    expect(resolveAutoRouterSend({ enabled: true, explicitModel: true, text: 'Hi', freeModels: free })).toBeNull();
    expect(listFreeOpenCodeModels([{ provider_id: 'opencode-go', configured: true, models: [{ id: 'opencode-go:glm-5.3-flash' }] }])).toEqual([
      { provider: 'opencode-go', model: 'glm-5.3-flash' }
    ]);
  });
});
