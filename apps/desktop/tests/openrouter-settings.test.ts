import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('OpenRouter provider settings flow', () => {
  // Normalize CRLF so line-ending churn in the working tree cannot break
  // multi-line source assertions.
  const source = readFileSync(path.resolve(process.cwd(), 'src/renderer/panels/SystemPanels.tsx'), 'utf8').replace(/\r\n/g, '\n');

  it('opens configuration for OpenRouter whether active or inactive', () => {
    expect(source).toContain("option.id === 'openrouter'");
    expect(source).toContain('onClick={() => void openOpenRouterSettings()}');
  });

  it('saves provider-scoped key and loads the live OpenRouter catalog', () => {
    expect(source).toContain("path: '/api/providers'");
    expect(source).toContain("body: { provider: 'openrouter', api_key: nextKey }");
    expect(source).toContain("path: '/api/models/live?provider=openrouter'");
    expect(source).toContain('openrouterNoModels');
  });

  it('lets users choose an allowlist and activates the selected default model', () => {
    expect(source).toContain('openRouterSelectedModels');
    expect(source).toContain('provider: \'openrouter\', models: selectedModels');
    expect(source).toContain("provider: 'openrouter',\n          base_url: 'https://openrouter.ai/api/v1'");
    expect(source).toContain('setDefaultModel({ model: selectedDefault })');
  });
});
