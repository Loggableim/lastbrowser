import { describe, expect, it } from 'vitest';
import { firstRunWizardPages } from '../src/renderer/components/first-run-flow.js';
import { readFileSync } from 'node:fs';

describe('first launch page flow', () => {
  it('puts browser and Dock setup before the explicit AI decision', () => {
    expect(firstRunWizardPages(null, false)).toEqual(['search', 'browser', 'apps', 'ai', 'space']);
  });
  it('omits migration entirely when no existing Sidekick was found', () => {
    expect(firstRunWizardPages('enabled', false)).not.toContain('migration');
  });
  it('inserts migration immediately after search only for a positive detection', () => {
    expect(firstRunWizardPages('enabled', true)).toEqual(['search', 'migration', 'browser', 'apps', 'ai', 'provider', 'space']);
  });
  it('keeps the Space step for both choices and provider setup only for opt-in', () => {
    expect(firstRunWizardPages('disabled', true)).toEqual(['search', 'migration', 'browser', 'apps', 'ai', 'space']);
    expect(firstRunWizardPages('enabled', false).at(-1)).toBe('space');
  });
  it('guards completion until the final page and forwards the actual trimmed Space name', () => {
    const source = readFileSync(new URL('../src/renderer/components/FirstRunSetupPane.tsx', import.meta.url), 'utf8');
    expect(source).toContain("if (page !== 'space' || aiChoice !== 'enabled' || saving || !firstSpaceName.trim() || !canSubmitForm) return;");
    expect(source).toContain('onCompleteBrowserSetup(firstSpaceName.trim())');
    expect(source).toContain('firstSpaceName: firstSpaceName.trim()');
    expect(source).toContain("if (event.key !== 'Escape' || busy || currentIndex <= 0) return;");
    expect(source).not.toContain("else void chooseAi('disabled');");
  });
});
