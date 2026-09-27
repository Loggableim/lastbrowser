import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { resolveCanonicalSpacePath } from '../src/renderer/space-paths.js';

describe('resolveCanonicalSpacePath', () => {
  it('maps a submitted relative path to its canonical absolute backend path', () => {
    const spaces = [
      { path: 'C:\\Users\\user\\.sidekick\\workspaces\\spaces\\audio-smoke' },
      { path: 'C:\\Users\\user\\.sidekick\\workspaces\\spaces\\research' }
    ];

    expect(resolveCanonicalSpacePath('spaces/audio-smoke', spaces)).toBe(spaces[0].path);
  });

  it('matches exact paths independent of slash style and casing', () => {
    const spaces = [{ path: 'C:/Work/Research' }];
    expect(resolveCanonicalSpacePath('c:\\work\\research\\', spaces)).toBe(spaces[0].path);
  });

  it('does not guess when no canonical path or multiple suffix matches exist', () => {
    expect(resolveCanonicalSpacePath('spaces/missing', [{ path: 'C:/Work/spaces/other' }])).toBeNull();
    expect(resolveCanonicalSpacePath('spaces/shared', [
      { path: 'C:/One/spaces/shared' },
      { path: 'C:/Two/spaces/shared' }
    ])).toBeNull();
  });

  it('uses the canonical path consistently for activation, model preference, and pinned apps', () => {
    const app = readFileSync(resolve(__dirname, '../src/renderer/App.tsx'), 'utf8');
    expect(app).toContain('handleSpaceSelect(canonicalPath)');
    expect(app).toContain('saveSpaceModel(createdSpacePath, data.model');
    expect(app).toContain('spacePath: createdSpacePath');
  });
});
