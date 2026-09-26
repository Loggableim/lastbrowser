export type PersistentPartitionSession = {
  clearCache: () => Promise<void>;
  clearStorageData: () => Promise<void>;
  clearAuthCache: () => Promise<void>;
};

export type ProfilePartitionCleanupResult = {
  ok: boolean;
  cleared: number;
  error?: string;
};

function spaceSlug(spacePath: string | null | undefined, knownSpacePaths: string[]): string {
  const normalized = (spacePath || 'home').toLowerCase();
  const slug = normalized.replace(/[^a-z0-9_-]/g, '_');
  if (normalized === 'home') return slug;

  const collidingPaths = [...new Set(knownSpacePaths.map((path) => path.toLowerCase()))]
    .filter((path) => path.replace(/[^a-z0-9_-]/g, '_') === slug)
    .sort();
  if (collidingPaths.length <= 1 || collidingPaths[0] === normalized) return slug;
  if (/^[a-z0-9_-]+$/.test(normalized) && collidingPaths.length <= 1) return slug;

  const encoded = Array.from(new TextEncoder().encode(normalized), (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${slug}~${encoded}`;
}

export function profileSpacePartitions(profileId: string, spacePaths: string[]): string[] {
  const knownPaths = [...new Set([...spacePaths, 'home'])];
  return [...new Set(knownPaths.map((spacePath) => {
    const slug = spaceSlug(spacePath, knownPaths);
    return `persist:space_${slug}_${profileId}`;
  }))];
}

/** Clear only persistent per-Space partitions belonging to a deleted custom profile. */
export async function clearDeletedProfilePartitions(
  profileId: string,
  spacePaths: string[],
  fromPartition: (partition: string) => PersistentPartitionSession
): Promise<ProfilePartitionCleanupResult> {
  if (profileId === 'default' || !/^[a-zA-Z0-9_-]{1,128}$/.test(profileId)) {
    return { ok: false, cleared: 0, error: 'Invalid or protected browser profile.' };
  }

  const partitions = profileSpacePartitions(profileId, spacePaths);
  let cleared = 0;
  const failures: string[] = [];

  for (const partition of partitions) {
    // Keep this check close to the destructive call so future changes to the
    // partition builder cannot accidentally broaden the deletion target.
    if (!partition.startsWith('persist:space_') || !partition.endsWith(`_${profileId}`)) {
      failures.push('A generated session partition did not match the deleted profile.');
      continue;
    }
    try {
      const target = fromPartition(partition);
      await target.clearStorageData();
      await target.clearCache();
      await target.clearAuthCache();
      cleared += 1;
    } catch {
      failures.push(partition);
    }
  }

  return failures.length
    ? { ok: false, cleared, error: `Could not clear ${failures.length} profile partition(s).` }
    : { ok: true, cleared };
}
