import { existsSync, lstatSync, mkdirSync, realpathSync } from 'node:fs';
import path from 'node:path';
import type { App } from 'electron';

type ProfileApplication = Pick<App, 'commandLine' | 'getPath' | 'setName' | 'setPath'>;

function legacyBrowserProfileDirectory(app: Pick<App, 'getPath'>): string | null {
  const legacy = path.join(app.getPath('appData'), '@lastbrowser', 'desktop');
  return existsSync(legacy) ? legacy : null;
}

export function defaultBrowserProfileDirectory(app: Pick<App, 'getPath'>): string {
  return legacyBrowserProfileDirectory(app) ?? path.join(app.getPath('appData'), 'Lastbrowser');
}

export function startupBrowserProfileDirectory(app: Pick<App, 'getPath' | 'commandLine'>): string {
  const override = app.commandLine.getSwitchValue('user-data-dir');
  return override ? path.resolve(override) : defaultBrowserProfileDirectory(app);
}

function protectedDirectory(root: string, name: string): string {
  const directory = path.join(root, name);
  mkdirSync(directory, { recursive: true });
  if (!lstatSync(directory).isDirectory() || path.relative(directory, realpathSync(directory))) {
    throw new Error('The startup directory escapes the protected profile');
  }
  return directory;
}

/** Call before Electron resolves userData or launches Chromium sessions. */
export function configureProfileDirectory(app: ProfileApplication, env = process.env): boolean {
  app.setName('Lastbrowser');
  if (app.commandLine.hasSwitch('lastbrowser-protected-profile')) {
    // The broker must authenticate the volume and pass its mounted root via
    // both switches before Electron starts. This configures paths, it does
    // not authenticate the volume or serve as an authorization boundary.
    const requested = app.commandLine.getSwitchValue('lastbrowser-protected-profile');
    const chromiumRoot = app.commandLine.getSwitchValue('user-data-dir');
    if (['remote-debugging-port', 'remote-debugging-pipe', 'remote-debugging-address'].some(name => app.commandLine.hasSwitch(name))) {
      throw new Error('Remote debugging is unavailable for the protected profile');
    }
    if (!path.isAbsolute(requested) || !path.isAbsolute(chromiumRoot) || path.relative(requested, chromiumRoot)) {
      throw new Error('The Chromium profile must match the protected profile');
    }
    const root = realpathSync(requested);
    if (path.relative(requested, root) || !lstatSync(root).isDirectory()) {
      throw new Error('The protected profile root is unavailable or redirected');
    }
    const session = protectedDirectory(root, 'chromium');
    const downloads = protectedDirectory(root, 'downloads');
    const crashDumps = protectedDirectory(root, 'crash-dumps');
    const temp = protectedDirectory(root, 'temp');
    // Sidekick's default runtime root is userData and its child process
    // inherits the protected temporary directory.
    app.setPath('userData', root);
    app.setPath('sessionData', session);
    app.setPath('downloads', downloads);
    app.setPath('crashDumps', crashDumps);
    app.setPath('temp', temp);
    env.TEMP = env.TMP = env.TMPDIR = temp;
    delete env.LASTBROWSER_ENABLE_CDP;
    delete env.LASTBROWSER_CDP_PORT;
    delete env.CDP_PORT;
    return true;
  }
  if (app.commandLine.hasSwitch('user-data-dir')) return false;

  // Older builds first resolved userData under the npm package name.
  // Keep using that directory for upgrades, even if both profile roots exist.
  const legacyDirectory = legacyBrowserProfileDirectory(app);
  if (legacyDirectory) app.setPath('userData', legacyDirectory);
  return false;
}
