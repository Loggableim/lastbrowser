import { readFileSync } from 'node:fs';
import path from 'node:path';

const markerName = 'lastbrowser-build-variant.json';

/** Trust only the explicit, version-bound marker emitted into offline previews. */
export function isOfflineTestBuild(resourcesPath: string | undefined, appVersion: string): boolean {
  if (!resourcesPath || !path.isAbsolute(resourcesPath) || !appVersion) return false;
  try {
    const marker = JSON.parse(readFileSync(path.join(resourcesPath, markerName), 'utf8'));
    if (!marker || typeof marker !== 'object' || Array.isArray(marker)) return false;
    const keys = Object.keys(marker).sort();
    if (keys.length !== 3 || keys[0] !== 'appVersion' || keys[1] !== 'schemaVersion' || keys[2] !== 'variant') return false;
    return marker.schemaVersion === 1 && marker.variant === 'offline-test' && marker.appVersion === appVersion;
  } catch {
    // Missing or malformed markers must not mask a real release packaging error.
    return false;
  }
}
