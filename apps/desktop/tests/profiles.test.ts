import { describe, expect, it } from 'vitest';
import {
  addProfile,
  createDefaultProfile,
  createProfile,
  defaultProfileId,
  loadActiveProfileId,
  loadProfiles,
  profileById,
  profilePartition,
  profilesStorageKey,
  removeProfile,
  renameProfile,
  saveActiveProfileId,
  saveProfiles
} from '../src/renderer/profiles.js';

function memoryStorage(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, value); },
    dump: () => Object.fromEntries(store)
  };
}

describe('browser profiles', () => {
  it('returns a default profile when storage is empty', () => {
    const profiles = loadProfiles(memoryStorage());
    expect(profiles).toHaveLength(1);
    expect(profiles[0].id).toBe(defaultProfileId);
    expect(profiles[0].isDefault).toBe(true);
  });

  it('round-trips profiles through storage', () => {
    const storage = memoryStorage();
    const profiles = addProfile([createDefaultProfile()], 'Work');
    saveProfiles(storage, profiles);

    const loaded = loadProfiles(storage);
    expect(loaded).toHaveLength(2);
    expect(loaded[1].name).toBe('Work');
    expect(loaded[1].id).not.toBe(defaultProfileId);
  });

  it('always keeps the default profile present', () => {
    const storage = memoryStorage({
      [profilesStorageKey]: JSON.stringify([{ id: 'custom', name: 'Only custom' }])
    });
    const loaded = loadProfiles(storage);
    expect(loaded.some((profile) => profile.id === defaultProfileId)).toBe(true);
  });

  it('gives each profile a distinct session partition', () => {
    const a = profilePartition('profile-1');
    const b = profilePartition('profile-2');
    expect(a).toBe('persist:profile-profile-1');
    expect(a).not.toBe(b);
    expect(a.startsWith('persist:')).toBe(true);
  });

  it('sanitizes profile ids for partition names', () => {
    expect(profilePartition('a b/c:d')).toBe('persist:profile-a-b-c-d');
  });

  it('refuses to delete the default profile', () => {
    const profiles = [createDefaultProfile(), createProfile('Work', [createDefaultProfile()])];
    const afterDelete = removeProfile(profiles, defaultProfileId);
    expect(afterDelete).toHaveLength(2);
  });

  it('removes a custom profile', () => {
    const work = createProfile('Work', [createDefaultProfile()]);
    const profiles = [createDefaultProfile(), work];
    const afterDelete = removeProfile(profiles, work.id);
    expect(afterDelete).toHaveLength(1);
    expect(afterDelete[0].id).toBe(defaultProfileId);
  });

  it('falls back to the default profile when a custom one is gone', () => {
    const profiles = [createDefaultProfile()];
    expect(profileById(profiles, 'missing').id).toBe(defaultProfileId);
  });

  it('renames a profile and ignores blank names', () => {
    const work = createProfile('Work', [createDefaultProfile()]);
    const profiles = [createDefaultProfile(), work];
    expect(renameProfile(profiles, work.id, 'Private')[1].name).toBe('Private');
    expect(renameProfile(profiles, work.id, '   ')[1].name).toBe('Work');
  });

  it('persists the active profile id', () => {
    const storage = memoryStorage();
    saveActiveProfileId(storage, 'profile-42');
    expect(loadActiveProfileId(storage)).toBe('profile-42');
  });

  it('defaults the active profile id when unset', () => {
    expect(loadActiveProfileId(memoryStorage())).toBe(defaultProfileId);
  });

  it('assigns distinct colors and icons to new profiles', () => {
    const first = createProfile('One', []);
    const second = createProfile('Two', [first]);
    expect(first.color).not.toBe(second.color);
    expect(first.icon).not.toBe(second.icon);
  });
});
