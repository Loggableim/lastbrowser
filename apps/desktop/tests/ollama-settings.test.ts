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

  it('saves chat picker choices through the bound Space scope and applies them only to the captured view', () => {
    const chatSource = readFileSync(path.resolve(process.cwd(), 'src/renderer/panels/NativeChatMain.tsx'), 'utf8');
    expect(chatSource).toContain("operation: 'modelSelection'");
    expect(chatSource).toContain('const capturedKey = modelViewKey;');
    expect(chatSource).toContain('modelClient.request({ schemaVersion: 1, operation: \'modelSelection\', scope: spaceModelSelection.scope, payload: {');
    expect(chatSource).toContain('action: \'set\', model: nextModel, provider, expectedRevision: spaceModelSelection.revision');
    expect(chatSource).toContain('if (modelViewKeyRef.current !== capturedKey) return;');
    expect(chatSource).toContain('setScopedModel({ viewKey: capturedKey, selection: result.value });');
    expect(chatSource).toContain('setSelectedModel(nextModel);');
    expect(chatSource).toContain('setSelectedModelProvider(provider);');
    expect(chatSource).toMatch(/catalogDefaultModel,\r?\n\s*'default'/);
  });
});
