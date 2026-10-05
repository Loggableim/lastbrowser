/** Pure shared legacy partition contract. Renderer and Main must use the same function. */
export function spacePartitionSlug(spacePath?: string | null, knownSpacePaths?: readonly string[]): string {
  const normalized = (spacePath || 'home').toLowerCase();
  const slug = normalized.replace(/[^a-z0-9_-]/g, '_');
  if (normalized === 'home') return slug;
  let collidingPaths: string[] = [];
  if (knownSpacePaths) {
    collidingPaths = [...new Set(knownSpacePaths.map(value => value.toLowerCase()))]
      .filter(value => value.replace(/[^a-z0-9_-]/g, '_') === slug).sort();
    if (collidingPaths.length <= 1 || collidingPaths[0] === normalized) return slug;
  }
  if (/^[a-z0-9_-]+$/.test(normalized) && collidingPaths.length <= 1) return slug;
  const encoded = Array.from(new TextEncoder().encode(normalized), byte => byte.toString(16).padStart(2, '0')).join('');
  return `${slug}~${encoded}`;
}
export function computeSpacePartition(profileId: string, spacePath?: string | null, incognito?: boolean, knownSpacePaths?: readonly string[]): string {
  if (incognito) return 'in-memory-incognito';
  return `persist:space_${spacePartitionSlug(spacePath, knownSpacePaths)}_${profileId}`;
}
