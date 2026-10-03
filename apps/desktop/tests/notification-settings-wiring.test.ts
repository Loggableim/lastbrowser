import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('notification and activity settings wiring', () => {
  it('shows automatic updates as always enabled and keeps manual checks independent of Sidekick readiness', () => {
    const source = readFileSync(path.resolve(process.cwd(), 'src/renderer/panels/SystemPanels.tsx'), 'utf8');
    const appSource = readFileSync(path.resolve(process.cwd(), 'src/renderer/App.tsx'), 'utf8');
    expect(source).toContain("description={t('browser.chrome.updateAlwaysEnabled')}");
    expect(source).toContain('await window.lastbrowser.updates.check();');
    expect(source).toContain("disabled={updatesState.loading || updateState === 'disabled'}");
    expect(source).not.toContain("updateDraftToggle('check_for_updates'");
    expect(appSource).not.toContain('updates.setAutoCheckEnabled');
  });
});
