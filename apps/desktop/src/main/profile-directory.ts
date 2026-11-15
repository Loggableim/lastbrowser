import { existsSync } from 'node:fs';
import path from 'node:path';
import type { App } from 'electron';

type ProfileApplication = Pick<App, 'commandLine' | 'getPath' | 'setName' | 'setPath'>;

/** Call before Electron resolves userData or launches Chromium sessions. */
export function configureProfileDirectory(app: ProfileApplication): void {
  app.setName('Lastbrowser');
  if (app.commandLine.hasSwitch('user-data-dir')) return;

  // Older builds first resolved userData under the npm package name.
  // Keep using that directory for upgrades, even if both profile roots exist.
  const legacyDirectory = path.join(app.getPath('appData'), '@lastbrowser', 'desktop');
  if (existsSync(legacyDirectory)) app.setPath('userData', legacyDirectory);
}
