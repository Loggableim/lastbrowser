import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createDesktopI18n } from '../src/renderer/i18n.js';

const renderer = (relativePath: string) => readFileSync(resolve(__dirname, '../src/renderer', relativePath), 'utf8');

describe('en_US shell copy', () => {
  it('resolves the reported surfaces in English and keeps German', () => {
    const en = createDesktopI18n('en');
    const de = createDesktopI18n('de');
    const keys = [
      'shell.backToWeb',
      'shell.backToWebTitle',
      'firstRun.welcomeBadge',
      'commands.nav.settings',
      'commands.tabs.new',
      'copilot.modelMenuTitle',
      'copilot.modelGroupOtherEngines',
      'copilot.quotaAvailable',
      'mail.noAccount'
    ] as const;
    expect(en.t('shell.backToWeb')).toBe('Back to the web');
    expect(de.t('shell.backToWeb')).toBe('Zurück zum Web');
    expect(en.t('firstRun.welcomeBadge')).toBe('Welcome');
    expect(de.t('firstRun.welcomeBadge')).toBe('Willkommen');
    expect(en.t('commands.nav.settings')).toBe('Open settings');
    expect(de.t('commands.nav.settings')).toBe('Einstellungen öffnen');
    expect(en.t('commands.tabs.new')).toBe('New tab');
    expect(en.t('copilot.modelMenuTitle')).toBe('Select AI model');
    expect(en.t('copilot.modelGroupOtherEngines')).toBe('Other engines');
    expect(de.t('copilot.modelGroupOtherEngines')).toBe('Weitere Engines');
    expect(en.t('copilot.quotaAvailable', { percent: 40, account: '' })).toBe('40% quota available');
    expect(de.t('copilot.quotaAvailable', { percent: 40, account: ' (work)' })).toBe('40% Kontingent verfügbar (work)');
    expect(en.t('mail.settings')).toBe('Mail settings');
    expect(de.t('mail.spaceInbox')).toBe('Postfach dieses Spaces');
    for (const key of keys) {
      expect(en.t(key)).not.toBe(key);
      expect(de.t(key)).not.toBe(en.t(key));
    }
  });

  it('wires the reported components through the catalog', () => {
    expect(renderer('App.tsx')).toContain("t('shell.backToWeb')");
    expect(renderer('App.tsx')).not.toContain('>Zurück zum Web<');
    expect(renderer('components/FirstRunSetupPane.tsx')).toContain("t('firstRun.welcomeBadge')");
    expect(renderer('components/CommandPalette.tsx')).toContain("t('commands.nav.settings')");
    expect(renderer('components/CommandPalette.tsx')).not.toContain("title: 'Einstellungen öffnen'");
    expect(renderer('components/CopilotSplitView.tsx')).toContain("t('copilot.modelMenuTitle')");
    expect(renderer('components/CopilotSplitView.tsx')).toContain("t('copilot.modelGroupOtherEngines')");
    expect(renderer('components/CopilotSplitView.tsx')).not.toContain('KI-Modell auswählen');
    expect(renderer('components/CopilotSplitView.tsx')).not.toContain('Weitere Engines');
    expect(renderer('panels/NativeMailMain.tsx')).toContain("t('mail.settings')");
    expect(renderer('panels/NativeMailMain.tsx')).not.toContain('Mail-Einstellungen');
  });
});
