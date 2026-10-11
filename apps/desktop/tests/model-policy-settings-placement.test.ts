import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { modelPolicySettingsCopy } from '../src/renderer/i18n/model-policy-settings-copy.js';
import { normalizeSettingsSectionId, SETTINGS_SECTIONS, visibleSettingsSections } from '../src/renderer/panels/SystemPanels.js';

const source = (file: string) => readFileSync(path.resolve(process.cwd(), 'src/renderer', file), 'utf8');

describe('model policy settings placement', () => {
  it('keeps policy forms out of chat and applies AUTO from the compact model selector', () => {
    const chat = source('panels/NativeChatMain.tsx');
    const composer = source('panels/ChatComponents.tsx');
    expect(chat).not.toContain('ModelPolicyControls');
    expect(chat).toMatch(/selection==='__lastbrowser_auto_policy__'[\s\S]*?saveModelPolicy\(\{mode:'auto'/);
    expect(composer).toContain("t('chat.chooseModelShort')");
    expect(composer).not.toContain('auto-policy-chip');
    expect(composer).toContain("value={AI_ORCHESTRATION_ENABLED && automaticPolicy?.active?'__lastbrowser_auto_policy__'");
  });

  it('keeps model policy controls intact while hiding the legacy Advanced section and falling back safely', () => {
    const settings = source('panels/SystemPanels.tsx');
    const app = readFileSync(path.resolve(process.cwd(), 'src/renderer/App.tsx'), 'utf8');
    expect(SETTINGS_SECTIONS.advanced.title).toBe('Advanced');
    expect(visibleSettingsSections().map(([id]) => id)).not.toContain('advanced');
    expect(normalizeSettingsSectionId('advanced')).toBe('conversation');
    expect(settings).toContain("section === 'advanced' && <AdvancedModelPolicySettings");
    expect(settings).toContain("operation: 'resolveScope'");
    expect(settings).toContain('backendProfileName });');
    expect(settings).toContain('scopeEpochRef.current.epoch === epoch');
    expect(settings).toContain('requestEpochRef.current === requestEpoch');
    expect(app).toContain('activeSessionId={activeSessionId}');
    expect(app).toContain('activeBackendProfileName={activeBackendProfileName || activeSession?.profile || null}');
  });

  it('has localized scope and loading guidance in all eight desktop languages', () => {
    const english = modelPolicySettingsCopy.en;
    for (const locale of ['en', 'de', 'it', 'es', 'fr', 'pt-BR', 'ru', 'ja'] as const) {
      const copy = modelPolicySettingsCopy[locale];
      expect(Object.keys(copy)).toEqual(Object.keys(english));
      expect(Object.values(copy).every(value => value.trim().length > 0)).toBe(true);
    }
    expect(modelPolicySettingsCopy.de.sessionRequired).toContain('Space');
    expect(modelPolicySettingsCopy.ja.sessionRequired.length).toBeGreaterThan(10);
  });
});
