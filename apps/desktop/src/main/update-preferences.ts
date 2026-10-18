import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export type UpdateChannel = 'stable' | 'beta';

export type UpdatePreferences = { channel: UpdateChannel };

export function isUpdateChannel(value: unknown): value is UpdateChannel {
  return value === 'stable' || value === 'beta';
}

export function updatePreferencePath(userDataDir: string): string {
  return path.join(userDataDir, 'update-preferences.json');
}

export function loadUpdatePreferences(userDataDir: string): UpdatePreferences {
  try {
    const parsed = JSON.parse(readFileSync(updatePreferencePath(userDataDir), 'utf8')) as { channel?: unknown };
    return { channel: isUpdateChannel(parsed.channel) ? parsed.channel : 'stable' };
  } catch {
    return { channel: 'stable' };
  }
}

export function saveUpdatePreferences(userDataDir: string, preferences: UpdatePreferences): UpdatePreferences {
  const normalized: UpdatePreferences = { channel: isUpdateChannel(preferences.channel) ? preferences.channel : 'stable' };
  const target = updatePreferencePath(userDataDir);
  mkdirSync(userDataDir, { recursive: true });
  const temporary = `${target}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(normalized, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  // Same-directory rename keeps readers from seeing a partial preference file.
  renameSync(temporary, target);
  return normalized;
}
