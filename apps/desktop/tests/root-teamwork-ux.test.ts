import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createDesktopI18n, desktopLocaleIds, desktopLocaleOverrides } from '../src/renderer/i18n.js';
import { DesktopI18nProvider } from '../src/renderer/i18n.js';
import { TeamworkProcessCard } from '../src/renderer/components/TeamworkProcessCard.js';

const requiredKeys = [
  'teamwork.status.on', 'teamwork.status.off', 'teamwork.status.unknown',
  'teamwork.overview.title', 'teamwork.overview.description',
  'teamwork.preset.cost', 'teamwork.preset.balanced', 'teamwork.preset.quality',
  'teamwork.advanced', 'teamwork.provider.title', 'teamwork.provider.note',
  'teamwork.provider.none', 'teamwork.provider.found', 'teamwork.provider.refresh',
  'teamwork.process.summary', 'teamwork.process.details', 'teamwork.process.complete',
  'teamwork.process.partial', 'teamwork.process.failed', 'teamwork.process.running',
  'teamwork.process.stopped', 'teamwork.process.skipped', 'teamwork.process.planned', 'teamwork.process.aborted', 'teamwork.process.diagnostic', 'teamwork.process.candidateDiagnostics', 'teamwork.process.critic', 'teamwork.process.contributor', 'teamwork.process.final',
  'teamwork.fallback.enabled', 'teamwork.fallback.enabledDescription', 'teamwork.fallback.quorum'
] as const;

describe('Teamwork simple and advanced UX', () => {
  it('provides translated status, preset, provider and process copy for every supported locale', () => {
    for (const locale of desktopLocaleIds) {
      const catalog = desktopLocaleOverrides[locale];
      for (const key of requiredKeys) {
        expect(catalog[key], `${locale} is missing ${key}`).toBeTruthy();
        expect(catalog[key], `${locale} has untranslated key ${key}`).not.toBe(key);
      }
    }

    const de = createDesktopI18n('de');
    expect(de.t('teamwork.process.summary', { count: 2, status: de.t('teamwork.process.partial') })).toBe('2 Beiträge · Teilweise abgeschlossen');
  });

  it('keeps resource controls behind a collapsed advanced disclosure and reports catalog discovery honestly', () => {
    const settings = readFileSync(resolve(import.meta.dirname, '../src/renderer/panels/TeamworkSettingsPanel.tsx'), 'utf8');
    expect(settings).toContain('<details className="settings-card"');
    expect(settings).toContain("title={t('teamwork.provider.title')} description={t('teamwork.provider.note')}");
    expect(settings).toContain('configReady ? (config.enabled ?');
    expect(settings).toContain('shared_grounding: false');
    expect(settings).toContain('setCatalogKnown(true)');
    expect(settings).not.toContain('Einsatzbereit');
  });

  it('invalidates old configuration work across A→B→A and keeps unknown scope state unsaveable', () => {
    const settings = readFileSync(resolve(import.meta.dirname, '../src/renderer/panels/TeamworkSettingsPanel.tsx'), 'utf8');
    expect(settings).toContain('lastScopeIdentityRef.current !== scopeIdentity');
    expect(settings).toContain('scopeEpochRef.current += 1');
    expect(settings).toContain('requestEpoch !== scopeEpochRef.current');
    expect(settings).toContain('const configReady = configKnown && configScopeIdentity === scopeIdentity');
    expect(settings).toContain('if (!configReady || loading) return;');
    expect(settings).toContain('setConfigScopeIdentity(null)');
  });

  it('shows only actual worker contributions with their provider/model and never exposes critic model IDs', () => {
    const processCard = readFileSync(resolve(import.meta.dirname, '../src/renderer/components/TeamworkProcessCard.tsx'), 'utf8');
    expect(processCard).not.toContain('{critic.model}');
    expect(processCard).toContain('draft.provider || draft.model');
    expect(processCard).toContain('draft.status === \'planned\'');
    const markup = renderToStaticMarkup(createElement(DesktopI18nProvider, null, createElement(TeamworkProcessCard, {
      metadata: { status: 'running', stage: 'debate', plannedWorkers: [
        { name: 'Gemini review', model: 'gemini-2.5-pro', provider: 'google-gemini-cli', role: 'Reviewer', content: '', execution_ms: 0, status: 'running' },
        { name: 'GPT review', model: 'gpt-model-2', provider: 'openai', role: 'Reviewer', content: 'Draft in progress', execution_ms: 0, status: 'planned' },
        { name: 'Ollama check', model: 'qwen-model-3', provider: 'ollama-cloud', role: 'Fact check', content: '', execution_ms: 0, status: 'planned' },
      ], drafts: [{ workerId: 'worker-1', name: 'Gemini review', model: 'gemini-2.5-pro', provider: 'google-gemini-cli', role: 'Reviewer', content: 'Streaming excerpt', execution_ms: 0, status: 'running' }] },
    })));
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).toContain('Streaming excerpt');
    expect(processCard).toContain("'teamwork.process.partial'");
    expect(processCard).toContain("'teamwork.process.failed'");
    expect(processCard).toContain("'teamwork.process.running'");
    expect(processCard).toContain("'teamwork.process.stopped'");
  });

  it('labels the authorized single-provider fallback honestly and shows its actual model in details', () => {
    const markup = renderToStaticMarkup(createElement(DesktopI18nProvider, null, createElement(TeamworkProcessCard, {
      metadata: { status: 'complete', stage: 'single_provider', completeReceived: true,
        plannedWorkers: [{ workerId: 'single-provider', workerIndex: 0, name: 'Teamwork', model: 'root-gpt-fixture',
          provider: 'custom:gpt-fixture', role: 'single_provider', content: '', execution_ms: 0, status: 'running' }],
        drafts: [{ workerId: 'single-provider', workerIndex: 0, name: 'Teamwork', model: 'root-gpt-fixture',
          provider: 'custom:gpt-fixture', role: 'single_provider', content: '', execution_ms: 0, status: 'complete' }] },
    })));
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).not.toContain('single_provider');
    expect(markup).toMatch(/Ein Modell|One model|Un modelo|Un modèle|Un modello|Um modelo|Одна модель|単一モデル/);
    expect(markup).toMatch(/1 .*Abgeschlossen|1 .*Complete|1 .*Completado|1 .*Terminé|1 .*Completato|1 .*Concluído|1 .*Завершено|1 .*完了/);
  });

  it('shows only sanitized backend failure details and allowlisted diagnostics in the expanded contribution', () => {
    const processCard = readFileSync(resolve(import.meta.dirname, '../src/renderer/components/TeamworkProcessCard.tsx'), 'utf8');
    expect(processCard).toContain('{draft.error || t(\'teamwork.process.failed\')}');
    expect(processCard).toContain("t('teamwork.process.diagnostic', { code: draft.failureCode })");
    const diagnosticCopy = createDesktopI18n('de').t('teamwork.process.diagnostic', { code: 'provider_admission_denied' });
    expect(diagnosticCopy).toBe('Diagnosecode: provider_admission_denied');
  });
});
