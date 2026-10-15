import { describe, expect, it } from 'vitest';
import { classifyAutoRouterPrompt, combineAutoRouterClass, listFreeOpenCodeModels, mergeAutoRouterTranscript, opencodeAutoRouterEnabled, planOpenCodeAutoRoute, previewAutoRouter, readScoutClass, resolveAutoRouterSend } from '../src/renderer/opencode-auto-router.js';

const bench = [
  { provider: 'opencode', model: 'cat-jam-free' },
  { provider: 'opencode', model: 'space-bunny-free' },
  { provider: 'opencode-go', model: 'cat-jam-free' },
  { provider: 'opencode', model: 'deepseek-v4.1-flash-free' },
  { provider: 'opencode-go', model: 'deepseek-v4.1-flash' },
  { provider: 'opencode', model: 'muse-spark-free' },
  { provider: 'openai', model: 'gpt-5' },
  { provider: 'opencode', model: 'other-strong-free' }
];

describe('OpenCode auto router prototype', () => {
  it('stays off unless the flag is set', () => {
    expect(opencodeAutoRouterEnabled({})).toBe(false);
    expect(opencodeAutoRouterEnabled({ flag: '1' })).toBe(true);
    expect(planOpenCodeAutoRoute({ text: 'Hi', freeModels: bench, enabled: false }).action).toBe('disabled');
  });

  it('answers a short question with cat-jam-free and does not start the strong lane', () => {
    const plan = planOpenCodeAutoRoute({ text: 'Was ist 2+2?', freeModels: bench, enabled: true });
    expect(plan.classification.kind).toBe('simple');
    expect(plan.scout).toEqual({ provider: 'opencode', model: 'cat-jam-free' });
    expect(plan.action).toBe('scout-only');
    let strongStarted = false;
    const preview = previewAutoRouter(plan, {
      scout: () => ({ text: '4.', cancel: () => undefined }),
      strong: () => { strongStarted = true; return { text: 'no', cancel: () => undefined }; }
    });
    expect(strongStarted).toBe(false);
    expect(preview).toMatchObject({ text: '4.', strongCancelled: true, lanesStarted: 1 });
  });

  it('falls back to space-bunny-free when cat-jam-free is absent', () => {
    const plan = planOpenCodeAutoRoute({
      text: 'Hi', enabled: true,
      freeModels: [{ provider: 'opencode', model: 'space-bunny-free' }, { provider: 'opencode-go', model: 'cat-jam-free' }]
    });
    expect(plan.scout).toEqual({ provider: 'opencode', model: 'space-bunny-free' });
  });

  it('classifies code as complex and hands off only to another free model', () => {
    const plan = planOpenCodeAutoRoute({ text: 'Please refactor this function\n```\nfunction add(){}\n```', freeModels: bench, enabled: true });
    expect(plan.classification.reasons).toEqual(expect.arrayContaining(['code', 'keyword']));
    expect(plan.action).toBe('handoff');
    expect(plan.strong).toEqual({ provider: 'opencode', model: 'other-strong-free' });
    const preview = previewAutoRouter(plan, {
      scout: () => ({ text: 'Kurz: die Funktion ist leer. ', cancel: () => undefined }),
      strong: () => ({ text: 'Kurz: die Funktion ist leer. Danach kommt die konkrete Änderung.', cancel: () => undefined })
    });
    expect(preview.lanesStarted).toBe(2);
    expect(preview.text).toBe('Kurz: die Funktion ist leer. Danach kommt die konkrete Änderung.');
  });

  it('drops paid, timeout and unstable models', () => {
    const onlyBlocked = planOpenCodeAutoRoute({
      text: 'Hi', enabled: true,
      freeModels: [
        { provider: 'opencode', model: 'deepseek-v4.1-flash-free' },
        { provider: 'opencode-go', model: 'deepseek-v4.1-flash' },
        { provider: 'opencode', model: 'muse-spark-free' },
        { provider: 'openai', model: 'gpt-5' }
      ]
    });
    expect(onlyBlocked.scout).toBeNull();
    expect(onlyBlocked.action).toBe('disabled');
  });

  it('combines the heuristic with the model judgment and treats doubt as complex', () => {
    expect(combineAutoRouterClass('simple', 'simple')).toBe('simple');
    expect(combineAutoRouterClass('simple', 'complex')).toBe('complex');
    expect(combineAutoRouterClass('simple', 'uncertain')).toBe('complex');
    expect(combineAutoRouterClass('complex', 'simple')).toBe('complex');
    expect(combineAutoRouterClass('simple', null)).toBe('simple');
    expect(readScoutClass('{"class":"complex"}')).toBe('complex');
    expect(readScoutClass('noch kein json')).toBeNull();
    const upgraded = planOpenCodeAutoRoute({ text: 'Hi', freeModels: bench, enabled: true, modelJudgment: 'uncertain' });
    expect(upgraded.classification.kind).toBe('complex');
    expect(upgraded.action).toBe('handoff');
  });

  it('records a measurable classification score', () => {
    const simple = classifyAutoRouterPrompt({ text: 'Hi' });
    const complex = classifyAutoRouterPrompt({ text: 'x'.repeat(700), pageContext: 'y'.repeat(1600) });
    expect(simple.kind).toBe('simple');
    expect(complex.kind).toBe('complex');
    expect(complex.score).toBeGreaterThan(simple.score);
    expect(mergeAutoRouterTranscript('A', 'B', 'simple')).toBe('A');
  });

  it('routes an automatic turn to cat-jam-free and leaves an explicit model alone', () => {
    const sent = resolveAutoRouterSend({ enabled: true, explicitModel: false, text: 'Hi', freeModels: bench });
    expect(sent?.model).toBe('cat-jam-free');
    expect(sent?.provider).toBe('opencode');
    expect(resolveAutoRouterSend({ enabled: true, explicitModel: true, text: 'Hi', freeModels: bench })).toBeNull();
    expect(listFreeOpenCodeModels([{ provider_id: 'opencode', configured: true, models: [{ id: 'opencode:cat-jam-free' }] }])).toEqual([
      { provider: 'opencode', model: 'cat-jam-free' }
    ]);
  });
});
