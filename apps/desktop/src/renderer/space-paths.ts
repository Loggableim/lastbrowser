import type { SpaceSummary } from './shell-state.js';

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
