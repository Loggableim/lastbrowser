import { describe, expect, it } from 'vitest';
import config from '../vite.config.js';

describe('vite renderer config', () => {
  it('builds renderer asset URLs relative to index.html for Electron file loading', () => {
    expect(config.base).toBe('./');
  });

  it('cleans only the renderer output so stale bundles do not inflate installers', () => {
    expect(config.build?.emptyOutDir).toBe(true);
    expect(config.build?.outDir).toBe('dist/renderer');
  });
});
