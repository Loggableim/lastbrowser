import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  isCurrentSpaceDirectorySnapshot,
  resolveCanonicalSpacePath,
  resolveRefreshedActiveSpacePath
} from '../src/renderer/space-paths.js';

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

  it('discards a Space list response that started before a directory mutation', () => {
    expect(isCurrentSpaceDirectorySnapshot(4, 4)).toBe(true);
    expect(isCurrentSpaceDirectorySnapshot(4, 5)).toBe(false);
  });

  it('preserves a Space selected while an older listSpaces request was in flight', () => {
    expect(resolveRefreshedActiveSpacePath({
      currentPath: 'C:/Spaces/new-space',
      availablePaths: ['C:/Spaces/default'],
      lastPath: 'C:/Spaces/default',
      selectionRevisionAtRequest: 7,
      currentSelectionRevision: 8
    })).toBe('C:/Spaces/new-space');
  });

  it('uses the backend last Space when the current path is missing and no newer selection exists', () => {
    expect(resolveRefreshedActiveSpacePath({
      currentPath: 'C:/Spaces/removed',
      availablePaths: ['C:/Spaces/default', 'C:/Spaces/research'],
      lastPath: 'C:/Spaces/research',
      selectionRevisionAtRequest: 2,
      currentSelectionRevision: 2
    })).toBe('C:/Spaces/research');
  });

  it('uses the canonical path consistently for activation, model preference, and pinned apps', () => {
    const app = readFileSync(resolve(__dirname, '../src/renderer/App.tsx'), 'utf8');
    expect(app).toContain('handleSpaceSelect(canonicalPath)');
    expect(app).toContain('saveSpaceModel(createdSpacePath, chosen.value.model');
    expect(app).toContain('spacePath: createdSpacePath');
    expect(app).toContain('isCurrentSpaceDirectorySnapshot(directoryRevisionAtRequest, spaceDirectoryRevisionRef.current)');
    expect(app).toMatch(/selectionRevisionAtRequest,\s*currentSelectionRevision:\s*activeSpaceSelectionRevisionRef\.current/);
  });
});
