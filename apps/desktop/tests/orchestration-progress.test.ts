import { describe, expect, it } from 'vitest';
import { describeOrchestrationProgress } from '../src/renderer/orchestration-progress.js';

describe('orchestration chat progress', () => {
  it('shows Teamwork stages, planner, draft, critic, and completion events', () => {
    expect(describeOrchestrationProgress('teamwork_stage', { stage: 'debate', message: '2 Modelle debattieren parallel...' }))
      .toEqual({ mode: 'teamwork', message: 'Teamwork: 2 Modelle debattieren parallel...' });
    expect(describeOrchestrationProgress('teamwork_plan', { model: 'provider:planner' })?.message)
      .toContain('Arbeitsplan von provider:planner erstellt');
    expect(describeOrchestrationProgress('teamwork_draft', { name: 'Model A' })?.message)
      .toContain('Entwurf von Model A eingetroffen');
    expect(describeOrchestrationProgress('teamwork_draft', { name: 'Model A', error: 'quota' })?.message)
      .toContain('keinen nutzbaren Entwurf');
    expect(describeOrchestrationProgress('teamwork_critic', { model: 'Reviewer' })?.message)
      .toContain('Review von Reviewer abgeschlossen');
    expect(describeOrchestrationProgress('teamwork_complete', {})?.message)
      .toContain('Synthese abgeschlossen');
  });

  it('shows Smart Track routing, preplanning, execution, and completion events', () => {
    expect(describeOrchestrationProgress('smart_track_routed', { effort: 'high', name: 'Current model' }))
      .toEqual({ mode: 'smart-track', message: 'Smart Track HIGH: Current model ausgewählt.' });
    expect(describeOrchestrationProgress('smart_track_step', { stage: 'preplan' })?.message)
      .toContain('Vorplanung läuft');
    expect(describeOrchestrationProgress('smart_track_preplan', {})?.message)
      .toContain('Vorplanung abgeschlossen');
    expect(describeOrchestrationProgress('smart_track_complete', {})?.message)
      .toContain('Antwort abgeschlossen');
  });

  it('ignores ordinary chat events and bounds model labels', () => {
    expect(describeOrchestrationProgress('delta', { content: 'answer' })).toBeNull();
    expect(describeOrchestrationProgress('teamwork_plan', { model: 'x'.repeat(200) })?.message.length).toBeLessThan(150);
    expect(describeOrchestrationProgress('teamwork_stage', null)?.mode).toBe('teamwork');
  });
});
