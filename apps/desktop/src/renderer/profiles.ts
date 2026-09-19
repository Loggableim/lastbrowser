/**
 * Browser profiles — isolated browsing sessions.
 *
 * Each profile maps to its own Electron session partition
 * (`persist:profile-<id>`), so cookies, logins, localStorage and cache are
 * fully separated between profiles. This is the workspace-isolation model
 * from the original LastBrowser design, rebuilt for the current shell.
 */

export type BrowserProfile = {
  id: string;
  name: string;
  color: string;
  icon: string;
  createdAt: number;
  /** Marks the profile that cannot be deleted. */
  isDefault?: boolean;
};

export const profilesStorageKey = 'lastbrowser.profiles.v1';
export const activeProfileStorageKey = 'lastbrowser.activeProfile.v1';

export const defaultProfileId = 'default';
export const defaultProfileColor = '#2563FF';

const profileColors = [
  '#2563FF',
  '#00E5FF',
  '#8A3FFC',
  '#FF2D8F',
  '#FF8A00',
  '#7CFF6B',
  '#FFC800',
  '#FF5C5C'
];

const profileIcons = ['🌐', '💼', '🕵️', '🎮', '📚', '🛒', '🎨', '🔒'];

type ProfileStorage = Pick<Storage, 'getItem' | 'setItem'>;

export function createDefaultProfile(): BrowserProfile {
  return {
    id: defaultProfileId,
    name: 'Default',
    color: defaultProfileColor,
    icon: '🌐',
    createdAt: 0,
    isDefault: true
  };
}

export function createProfile(name: string, existing: BrowserProfile[] = []): BrowserProfile {
  const index = existing.length;
  return {
    id: `profile-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: name.trim() || `Profile ${index + 1}`,
    color: profileColors[index % profileColors.length],
    icon: profileIcons[index % profileIcons.length],
    createdAt: Date.now()
  };
}

/**
 * Session partition for a profile. Electron treats `persist:` partitions as
 * durable storage on disk, keyed by this exact string.
 */
export function profilePartition(profileId: string): string {
  const safe = String(profileId || defaultProfileId).replace(/[^a-zA-Z0-9_-]/g, '-');
  return `persist:profile-${safe}`;
}

export function loadProfiles(storage: Pick<Storage, 'getItem'> = window.localStorage): BrowserProfile[] {
  const raw = storage.getItem(profilesStorageKey);
  if (!raw) return [createDefaultProfile()];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [createDefaultProfile()];
    const profiles = parsed
      .map((entry) => normalizeProfile(entry))
      .filter((entry): entry is BrowserProfile => Boolean(entry));
    if (!profiles.some((profile) => profile.id === defaultProfileId)) {
      profiles.unshift(createDefaultProfile());
    }
    return profiles;
  } catch {
    return [createDefaultProfile()];
  }
}

export function saveProfiles(storage: ProfileStorage = window.localStorage, profiles: BrowserProfile[]): void {
  storage.setItem(profilesStorageKey, JSON.stringify(profiles));
}

export function loadActiveProfileId(storage: Pick<Storage, 'getItem'> = window.localStorage): string {
  const raw = storage.getItem(activeProfileStorageKey);
  return raw && raw.trim() ? raw.trim() : defaultProfileId;
}

export function saveActiveProfileId(storage: ProfileStorage = window.localStorage, profileId: string): void {
  storage.setItem(activeProfileStorageKey, profileId);
}

export function addProfile(profiles: BrowserProfile[], name: string): BrowserProfile[] {
  return [...profiles, createProfile(name, profiles)];
}

export function renameProfile(profiles: BrowserProfile[], profileId: string, name: string): BrowserProfile[] {
  const clean = name.trim();
  if (!clean) return profiles;
  return profiles.map((profile) => (
    profile.id === profileId ? { ...profile, name: clean } : profile
  ));
}

export function removeProfile(profiles: BrowserProfile[], profileId: string): BrowserProfile[] {
  if (profileId === defaultProfileId) return profiles;
  const next = profiles.filter((profile) => profile.id !== profileId);
  return next.length ? next : [createDefaultProfile()];
}

export function profileById(profiles: BrowserProfile[], profileId: string): BrowserProfile {
  return profiles.find((profile) => profile.id === profileId)
    || profiles.find((profile) => profile.id === defaultProfileId)
    || createDefaultProfile();
}

function normalizeProfile(entry: unknown): BrowserProfile | null {
  if (!entry || typeof entry !== 'object') return null;
  const candidate = entry as Partial<BrowserProfile>;
  const id = String(candidate.id || '').trim();
  if (!id) return null;
  return {
    id,
    name: String(candidate.name || '').trim() || 'Profile',
    color: String(candidate.color || '').trim() || defaultProfileColor,
    icon: String(candidate.icon || '').trim() || '🌐',
    createdAt: typeof candidate.createdAt === 'number' ? candidate.createdAt : Date.now(),
    isDefault: candidate.isDefault === true || id === defaultProfileId
  };
}
