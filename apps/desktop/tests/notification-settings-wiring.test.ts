import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('notification and activity settings wiring', () => {
  it('applies the automatic update-check preference after settings load and leaves manual checks available', () => {
    const source = readFileSync(path.resolve(process.cwd(), 'src/renderer/panels/SystemPanels.tsx'), 'utf8');
    const appSource = readFileSync(path.resolve(process.cwd(), 'src/renderer/App.tsx'), 'utf8');
    const preferenceSource = readFileSync(path.resolve(process.cwd(), 'src/renderer/update-preference.ts'), 'utf8');

    expect(source).toContain('const autoUpdateChecksEnabled = settingsBoolean(draft.check_for_updates ?? settings.check_for_updates, true);');
    expect(source).toContain('await window.lastbrowser.updates.check();');
    expect(preferenceSource).toContain('if (!hydrated || settings === null) return null;');
    expect(appSource).toContain('resolveAutoUpdateCheckPreference(desktopSettings, desktopSettingsHydrated)');
    expect(appSource).toContain('if (enabled === null) return;');
    expect(appSource).toContain('window.lastbrowser.updates.setAutoCheckEnabled(enabled)');
  });
});
