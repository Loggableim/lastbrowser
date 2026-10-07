import type { SpaceSummary } from './shell-state.js';
import type { ProfileBindingEntry } from './independent-contracts.js';

function normalizePathForComparison(value: string): string {
  return value.trim().replace(/\\/g, '/').replace(/\/{2,}/g, '/').replace(/\/+$/, '').toLowerCase();
}

/** Match a submitted relative Space path to the canonical path returned by the backend. */
export function resolveCanonicalSpacePath(
  requestedPath: string,
  spaces: Array<Pick<SpaceSummary, 'path'>>
): string | null {
  const requested = normalizePathForComparison(requestedPath);
  if (!requested) return null;

  const exact = spaces.filter((space) => normalizePathForComparison(space.path) === requested);
  if (exact.length === 1) return exact[0].path;
  if (exact.length > 1) return null;

  const suffix = `/${requested}`;
  const suffixMatches = spaces.filter((space) => normalizePathForComparison(space.path).endsWith(suffix));
  return suffixMatches.length === 1 ? suffixMatches[0].path : null;
}

/** Reuse a persisted Space binding only when it is unique and matches the requested backend profile. */
export function resolveExistingSpaceBackendProfile(
  canonicalPath: string,
  requestedBackendProfileName: string | undefined,
  bindings: readonly ProfileBindingEntry[]
): { ok: true; backendProfileName?: string } | { ok: false; reason: 'ambiguous' | 'profile_mismatch' } {
  const matches = bindings.filter(binding => binding.workspacePath !== null
    && resolveCanonicalSpacePath(canonicalPath, [{ path: binding.workspacePath }]) === binding.workspacePath);
  if (matches.length > 1) return { ok: false, reason: 'ambiguous' };
  const existing = matches[0];
  if (existing && requestedBackendProfileName && existing.backendProfileName !== requestedBackendProfileName) {
    return { ok: false, reason: 'profile_mismatch' };
  }
  return { ok: true, ...(existing ? { backendProfileName: existing.backendProfileName } : {}) };
}

/** Ignore a Space refresh response that started before a local create/rename/delete. */
export function isCurrentSpaceDirectorySnapshot(requestRevision: number, currentRevision: number): boolean {
  return requestRevision === currentRevision;
}

/** A delayed listSpaces response must not undo a more recent user selection. */
export function resolveRefreshedActiveSpacePath(options: {
  currentPath: string;
  availablePaths: string[];
  lastPath?: string;
  selectionRevisionAtRequest: number;
  currentSelectionRevision: number;
}): string {
  const {
    currentPath,
    availablePaths,
    lastPath,
    selectionRevisionAtRequest,
    currentSelectionRevision
  } = options;
  if (selectionRevisionAtRequest !== currentSelectionRevision) return currentPath;
  if (currentPath && (availablePaths.includes(currentPath) || currentPath === 'home')) return currentPath;
  return lastPath || availablePaths[0] || '';
}
