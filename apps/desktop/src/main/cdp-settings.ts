import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export type CdpPreference = { enabled: boolean };

export function cdpPreferencePath(userDataDir: string): string {
  return path.join(userDataDir, 'browser-runtime-settings.json');
}

export function loadCdpPreference(userDataDir: string): CdpPreference {
  try {
    const parsed = JSON.parse(readFileSync(cdpPreferencePath(userDataDir), 'utf8')) as Partial<CdpPreference>;
    return { enabled: parsed.enabled === true };
  } catch {
    return { enabled: false };
  }
}

export function saveCdpPreference(userDataDir: string, preference: CdpPreference): CdpPreference {
  const normalized = { enabled: preference.enabled === true };
  const target = cdpPreferencePath(userDataDir);
  mkdirSync(userDataDir, { recursive: true });
  const temporary = `${target}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(normalized, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  // Same-directory rename keeps readers from seeing a partial preference file.
  renameSync(temporary, target);
  return normalized;
}
