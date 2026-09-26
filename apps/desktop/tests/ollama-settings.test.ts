import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Ollama settings configuration flow', () => {
  const source = readFileSync(path.resolve(process.cwd(), 'src/renderer/panels/SystemPanels.tsx'), 'utf8');

  it('keeps Ollama configure controls available when that provider is already active', () => {
    expect(source).toContain(") : ['ollama', 'ollama-cloud'].includes(option.id) ? (");
    expect(source).toContain("const currentProviderSettings = activeProvider === option.id ? settings : providerConfig;");
  });

  it('uses the OpenAI-compatible Ollama Cloud v1 endpoint consistently', () => {
    expect(source).toContain("'https://ollama.com/v1'");
    expect(source).toContain("`${baseUrl.replace(/\\/v1$/i, '')}/v1/models`");
    expect(source).toContain("path: '/api/providers'");
  });
});
