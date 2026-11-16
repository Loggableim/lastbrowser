import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Ollama settings configuration flow', () => {
  const source = readFileSync(path.resolve(process.cwd(), 'src/renderer/panels/SystemPanels.tsx'), 'utf8');

  it('keeps Ollama configure controls available when that provider is already active', () => {
    expect(source).toContain(") : ['ollama', 'ollama-cloud'].includes(option.id) ? (");
    expect(source).toContain("const currentProviderSettings = activeProvider === option.id ? settings : providerConfig;");
  });

  it('probes Ollama through Sidekick so Cloud requests do not depend on renderer CORS', () => {
    expect(source).toContain("'https://ollama.com/v1'");
    expect(source).toContain("path: '/api/providers/test'");
    expect(source).not.toContain('fetch(testUrl');
    expect(source).toContain("path: '/api/providers'");
  });

  it('keeps the API key in a password field and out of general desktop settings', () => {
    expect(source).toContain('type="password"');
    expect(source).toContain('api_key: ollamaKey.trim()');
    expect(source).toContain('...cleanSettingsPayload(settings)');
    expect(source).not.toContain('api_key: ollamaKey.trim(),\n                                  ...cleanSettingsPayload');
  });

  it('activates Ollama only in the Space used for its credentials', () => {
    const modalStart = source.indexOf('{/* Ollama Config Modal */}');
    const modalEnd = source.indexOf("{section === 'teamwork'", modalStart);
    const modal = source.slice(modalStart, modalEnd);
    expect(modal).toMatch(/saveSettings\(\{\s*scopeSelection,\s*settings:/);
    expect(modal).not.toContain('cleanSettingsPayload(settings)');
  });

  it('requires a new or saved API key before activating Ollama Cloud', () => {
    const modal = source.slice(source.indexOf('{/* Ollama Config Modal */}'));
    expect(source).toMatch(/const ollamaCloudKeyMissing = ollamaModalProviderId === 'ollama-cloud' && !ollamaKey.trim\(\) && !ollamaHasSavedKey/);
    expect(source).toMatch(/path: '\/api\/providers', scopeSelection \}\).then\(response => \{\s*if \(!isCurrentOllamaDialog\(scopeSelection\)\) return;/);
    expect(modal).toMatch(/className="primary-action compact"\s+disabled=\{!ollamaUrl.trim\(\) \|\| ollamaCloudKeyMissing \|\| ollamaTesting \|\| saving\}/);
    expect(modal).toMatch(/if \(!scopeSelection \|\| !isCurrentOllamaDialog\(scopeSelection\) \|\| ollamaCloudKeyMissing\) return;\s+setSaving\(true\);/);
  });

  it('saves chat picker choices through the bound Space scope and applies them only to the captured view', () => {
    const chatSource = readFileSync(path.resolve(process.cwd(), 'src/renderer/panels/NativeChatMain.tsx'), 'utf8');
    expect(chatSource).toContain("operation: 'modelSelection'");
    expect(chatSource).toContain('const capturedKey = modelViewKey;');
    expect(chatSource).toContain('modelClient.request({ schemaVersion: 1, operation: \'modelSelection\', scope: base.selection.scope, payload: {');
    expect(chatSource).toContain("action: 'set', model: target.model, provider: target.provider,");
    expect(chatSource).toContain('expectedRevision: base.selection.revision');
    expect(chatSource).toContain('if (modelViewKeyRef.current !== target.viewKey) continue;');
    expect(chatSource).toContain('setScopedModel({ viewKey: target.viewKey, selection: result.value });');
    expect(chatSource).toContain('if (latestChoiceRef.current?.sequence !== target.sequence) continue;');
    expect(chatSource).toContain('setSelectedModel(target.model);');
    expect(chatSource).toContain('setSelectedModelProvider(target.provider);');
    expect(chatSource).toMatch(/catalogDefaultModel,\r?\n\s*'default'/);
  });
});
