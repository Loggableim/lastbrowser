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

  it('uses the server model default in the chat picker when no local choice exists', () => {
    const chatSource = readFileSync(path.resolve(process.cwd(), 'src/renderer/panels/NativeChatMain.tsx'), 'utf8');
    expect(chatSource).toContain("resolveCatalogModelSelection(data?.default_model, rawParsed, data?.active_provider)");
    expect(chatSource).toContain("currentSelection.setSelectedModelProvider(defaultSelection.provider || '')");
    expect(chatSource).toContain('catalogDefaultModel,\n    \'default\'');
  });
});
