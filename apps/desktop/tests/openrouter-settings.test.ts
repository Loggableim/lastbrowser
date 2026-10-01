import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('OpenRouter provider settings flow', () => {
  // Normalize CRLF so line-ending churn in the working tree cannot break
  // multi-line source assertions.
  const source = readFileSync(path.resolve(process.cwd(), 'src/renderer/panels/SystemPanels.tsx'), 'utf8').replace(/\r\n/g, '\n');

  it('opens configuration for OpenRouter whether active or inactive', () => {
    expect(source).toContain("['openrouter', 'alibaba'].includes(option.id)");
    expect(source).toContain("openOpenRouterSettings(option.id as 'openrouter' | 'alibaba')");
  });

  it('saves provider-scoped key and loads the live OpenRouter catalog', () => {
    expect(source).toContain("path: '/api/providers'");
    expect(source).toContain("provider: providerId,");
    expect(source).toContain("path: `/api/models/live?provider=${providerId}&catalog=configuration`");
    expect(source).toContain('openrouterNoModels');
  });

  it('lets users choose an allowlist and activates the selected default model', () => {
    expect(source).toContain('openRouterSelectedModels');
    expect(source).toContain('const nextSelection = priorSelection.length || hasSelection ? priorSelection : [];');
    expect(source).toContain('provider: openRouterConfigProvider, models: selectedModels');
    expect(source).toContain("openRouterConfigProvider === 'openrouter' ? 'https://openrouter.ai/api/v1' : alibabaBaseUrl.trim()");
    expect(source).toContain('setDefaultModel({ model: selectedDefault })');
  });

  it('requires an HTTPS workspace endpoint before scanning and saving Alibaba credentials', () => {
    expect(source).toContain("parsedBaseUrl.protocol !== 'https:'");
    expect(source).toContain("if (openRouterConfigProvider === 'alibaba') body.base_url = alibabaBaseUrl.trim()");
    expect(source).toContain("t('settings.panels.providers.alibabaBaseUrlPlaceholder')");
    expect(source).toContain("body: { provider: 'alibaba', base_url: alibabaBaseUrl.trim() }");
  });
});
