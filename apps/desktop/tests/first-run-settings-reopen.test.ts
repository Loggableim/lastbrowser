import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const repoRoot = resolve(import.meta.dirname, '..');

describe('First Run setup re-entry from Settings', () => {
  it('routes Settings re-entry around a completed browser-only choice without rewriting consent', () => {
    const app = readFileSync(resolve(repoRoot, 'src/renderer/App.tsx'), 'utf8');
    expect(app.match(/onReopenSetup=\{reopenSetupFromSettings\}/g)).toHaveLength(2);
    expect(app).toContain('setSetupReopenRequested(true)');
    expect(app).toContain('reopenRequested: setupReopenRequested');
    expect(app).toContain('shouldShowFirstRunSetup(setupState, onboardingStatus');
    expect(app).toContain("window.lastbrowser.setup.save({ aiChoice: choice })");
  });

});
