import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import {
  beginInstallFeedback,
  formatInstallMegabytes,
  formatInstallRemaining,
  formatInstallStatus,
  markInstallCancelled,
  markInstallFailed,
  readInstallFeedback,
  reconcileInstallFeedback,
  reloadInstallFeedbackFromSession,
  resetInstallFeedbackForTests,
} from '../src/renderer/components/local-model-install-feedback.js';

const memory = new Map<string, string>();
const sessionStorage = {
  getItem: (key: string) => memory.get(key) ?? null,
  setItem: (key: string, value: string) => { memory.set(key, value); },
  removeItem: (key: string) => { memory.delete(key); },
  clear: () => { memory.clear(); },
  key: (index: number) => [...memory.keys()][index] ?? null,
  get length() { return memory.size; },
};

const model = { id: 'mistralai/ministral', downloadBytes: 2000 * 1024 * 1024, active: false, installed: null };
const job = (patch: Record<string, unknown>) => ({
  id: 'job-1', operation: 'install', modelId: model.id, state: 'downloading', progress: 0, total: 0,
  downloadedBytes: 500 * 1024 * 1024, error: null, ...patch,
});

describe('local model install feedback', () => {
  afterEach(() => { resetInstallFeedbackForTests(); memory.clear(); });

  it('shows starting immediately and keeps that status across a remount', () => {
    vi.stubGlobal('sessionStorage', sessionStorage);
    beginInstallFeedback(model, 'request-1', [], 1_000);
    expect(formatInstallStatus('de', readInstallFeedback(model.id)!)).toBe('Download startet…');
    expect(formatInstallStatus('en', readInstallFeedback(model.id)!)).toBe('Download starting…');
    reloadInstallFeedbackFromSession();
    expect(readInstallFeedback(model.id)?.phase).toBe('starting');
    expect(readInstallFeedback(model.id)?.requestId).toBe('request-1');
  });

  it('shows percent, megabytes and a rough remaining time while the job downloads', () => {
    vi.stubGlobal('sessionStorage', sessionStorage);
    beginInstallFeedback(model, 'request-1', [], 1_000);
    reconcileInstallFeedback([model], [job({})], 11_000);
    const feedback = readInstallFeedback(model.id)!;
    expect(feedback.phase).toBe('downloading');
    expect(feedback.percent).toBe(25);
    expect(formatInstallMegabytes(feedback.downloadedBytes)).toBe('500 MB');
    expect(formatInstallMegabytes(feedback.totalBytes || 0)).toBe('2.000 MB');
    expect(feedback.remainingMs).toBe(30_000);
    expect(formatInstallRemaining('de', feedback.remainingMs)).toBe('ca. 30 s');
    expect(formatInstallRemaining('en', null)).toBe('Estimating time…');
  });

  it('moves from install check to ready, and surfaces cancel plus retry', () => {
    vi.stubGlobal('sessionStorage', sessionStorage);
    beginInstallFeedback(model, 'request-1', [], 1_000);
    reconcileInstallFeedback([model], [job({ state: 'verifying', downloadedBytes: model.downloadBytes })], 20_000);
    expect(formatInstallStatus('de', readInstallFeedback(model.id)!)).toBe('Installiere/Prüfe…');
    expect(formatInstallStatus('en', readInstallFeedback(model.id)!)).toBe('Installing/checking…');
    reconcileInstallFeedback([model], [job({ state: 'completed', downloadedBytes: model.downloadBytes })], 21_000);
    expect(formatInstallStatus('de', readInstallFeedback(model.id)!)).toBe('Fertig, Modell aktiv');
    expect(formatInstallStatus('en', readInstallFeedback(model.id)!)).toBe('Ready, model active');

    beginInstallFeedback(model, 'request-2', ['job-1'], 30_000);
    expect(markInstallCancelled(model.id)).toBeNull();
    expect(reconcileInstallFeedback([model], [job({ id: 'job-2', state: 'downloading' })], 31_000)).toEqual(['job-2']);
    expect(readInstallFeedback(model.id)?.phase).toBe('cancelled');

    beginInstallFeedback(model, 'request-3', ['job-2'], 40_000);
    markInstallFailed(model.id, 'disk full');
    expect(readInstallFeedback(model.id)?.phase).toBe('error');
    expect(readInstallFeedback(model.id)?.error).toBe('disk full');
    reloadInstallFeedbackFromSession();
    expect(readInstallFeedback(model.id)?.error).toBe('disk full');
  });

  it('wires the install button to session feedback and renders the local store outside the settings pager', () => {
    const store = readFileSync(new URL('../src/renderer/components/LocalModelStore.tsx', import.meta.url), 'utf8');
    const feedback = readFileSync(new URL('../src/renderer/components/local-model-install-feedback.ts', import.meta.url), 'utf8');
    const panels = readFileSync(new URL('../src/renderer/panels/SystemPanels.tsx', import.meta.url), 'utf8');
    expect(store).toContain('beginInstallFeedback');
    expect(store).toContain('formatInstallStatus');
    expect(feedback).toContain('Download startet…');
    expect(feedback).toContain('Download starting…');
    expect(store).toContain('startModelInstall(selected)');
    expect(store).toContain("operation:'cancel'");
    expect(store).toContain('local-model-category-tabs');
    const modelsAt = panels.indexOf("selectedProvider.id === 'local-ai' && tab === 'models'");
    const deckAt = panels.indexOf('<SettingsPageDeck', modelsAt);
    const modelsBranch = panels.slice(modelsAt, deckAt);
    expect(modelsBranch).toContain('className="local-ai-models-page"');
    expect(modelsBranch).toContain('<LocalAiSetupPane');
    expect(modelsBranch).not.toContain('SettingsPageDeck');
  });
});
