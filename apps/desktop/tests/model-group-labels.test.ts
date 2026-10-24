import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createDesktopI18n } from '../src/renderer/i18n.js';
import { modelGroupLabel } from '../src/renderer/model-group-labels.js';

const nativeChatMain = readFileSync(
  path.resolve(__dirname, '../src/renderer/panels/NativeChatMain.tsx'),
  'utf8'
);
const copilotSplitView = readFileSync(
  path.resolve(__dirname, '../src/renderer/components/CopilotSplitView.tsx'),
  'utf8'
);
const systemPanels = readFileSync(
  path.resolve(__dirname, '../src/renderer/panels/SystemPanels.tsx'),
  'utf8'
);

describe('F3 model group labels and switch copy (issue #172 i18n)', () => {
  it('localizes the OpenCode Go paid and free groups from the catalog group id', () => {
    const en = createDesktopI18n('en');
    const de = createDesktopI18n('de');
    expect(modelGroupLabel({ id: 'opencode-go', providerId: 'opencode-go', provider: 'OpenCode Go' }, en.t))
      .toBe('OpenCode Go (paid)');
    expect(modelGroupLabel({ id: 'opencode-go-free', providerId: 'opencode-go', provider: 'OpenCode Go Free' }, de.t))
      .toBe('OpenCode Go (kostenlos)');
    expect(modelGroupLabel({ id: 'opencode-go-free' }, de.t)).toBe('OpenCode Go (kostenlos)');
    expect(modelGroupLabel({ id: 'opencode-go' }, de.t)).toBe('OpenCode Go (bezahlt)');
    expect(modelGroupLabel({ provider: 'OpenCode Go Free' }, de.t)).toBe('OpenCode Go (kostenlos)');
  });

  it('keeps the backend label for other groups and falls back to the provider id', () => {
    const de = createDesktopI18n('de');
    expect(modelGroupLabel({ id: 'openrouter', providerId: 'openrouter', provider: 'OpenRouter' }, de.t))
      .toBe('OpenRouter');
    expect(modelGroupLabel({ providerId: 'nous' }, de.t)).toBe('nous');
    expect(modelGroupLabel({}, de.t)).toBe('');
  });

  it('routes the switch notices and settings hint through the translation catalog', () => {
    expect(nativeChatMain).toContain("t('chat.modelHiddenAll')");
    expect(nativeChatMain).toContain("t('chat.modelHiddenSwitched', { model, label: fallback.label })");
    expect(copilotSplitView).toContain("t('chat.modelHiddenSwitched', { model: activeModelId, label: fallback.label })");
    expect(systemPanels).toContain("t('settings.panels.providers.modelVisibilityHint')");
    expect(nativeChatMain).not.toContain('All models are hidden');
    expect(nativeChatMain).not.toContain('is hidden — switched to');
    expect(copilotSplitView).not.toContain('ist ausgeblendet – gewechselt zu');
  });

  it('localizes the model group labels shown in Settings', () => {
    expect(systemPanels).toContain('modelGroupLabel(');
    expect(systemPanels).toContain("settings.panels.providers.modelVisibilityHint");
  });
});
