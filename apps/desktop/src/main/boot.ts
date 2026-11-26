import { app, dialog } from 'electron';
import Module from 'node:module';
import { write } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findWindowsProtectedPair, ProtectedSpaceMigrationPendingError } from './active-space-config.js';
import { defaultBrowserProfileDirectory, startupBrowserProfileDirectory } from './profile-directory.js';
import { rendererStoreWorkerSwitch } from './renderer-store-worker-client.js';
import { migrationWorkerSwitch } from './windows-space-migration-request.js';

// electron-builder can omit the hoisted `ms` package. `debug`, which
// electron-updater loads while this process starts, requires it. Resolve
// that copy from the staged vendor directory before the app entry imports it.
const vendor = path.join(path.dirname(fileURLToPath(import.meta.url)), 'vendor');
type NodeModulePaths = (this: unknown, from: string) => string[];
const nodeModule = Module as unknown as { _nodeModulePaths: NodeModulePaths };
const original = nodeModule._nodeModulePaths;
nodeModule._nodeModulePaths = function (this: unknown, from: string) {
  const paths = original.call(this, from);
  if (!paths.includes(vendor)) paths.unshift(vendor);
  return paths;
};

async function launchProtectedProfile(): Promise<boolean> {
  if (process.platform !== 'win32' || app.commandLine.hasSwitch('lastbrowser-protected-profile')) return false;
  try {
    const pair = await findWindowsProtectedPair(startupBrowserProfileDirectory(app));
    if (!pair) return false;
    const { startWindowsProtectedSpace } = await import('./windows-protected-space-startup.js');
    await startWindowsProtectedSpace(pair);
  } catch (error) {
    const german = app.getLocale().startsWith('de');
    const message = error instanceof ProtectedSpaceMigrationPendingError
      ? (german
        ? 'Die Einrichtung der geschützten Spaces läuft noch oder wurde unterbrochen. Warte, bis sie abgeschlossen ist, und starte LastBrowser erneut. Falls die Einrichtung abgebrochen wurde, lass die Space-Dateien unverändert und wende dich an support@lastbrowser.com.'
        : 'Protected Space setup is still running or was interrupted. Wait for it to finish, then reopen LastBrowser. If setup was interrupted, leave the Space files in place and contact support@lastbrowser.com.')
      : (german ? 'Der geschützte Space konnte nicht gestartet werden.' : 'The protected Space could not start.');
    dialog.showErrorBox('LastBrowser', message);
    app.exit(1);
  }
  return true;
}

async function runSpaceMigrationWorker() {
  const parent = app.commandLine.getSwitchValue(migrationWorkerSwitch);
  if (!/^[1-9][0-9]*$/.test(parent) || Number(parent) !== process.ppid) throw new Error('Invalid migration worker parent');
  const { runOfflineWindowsSpaceMigration } = await import('./windows-space-offline-migration.js');
  const { resolveWindowsSpaceMigrationRuntime } = await import('./windows-space-runtime.js');
  let reserved = false;
  try {
    await runOfflineWindowsSpaceMigration({
      ...resolveWindowsSpaceMigrationRuntime(process.resourcesPath),
      legacyUserData: defaultBrowserProfileDirectory(app), parentPid: Number(parent),
      browserExecutable: process.execPath, browserArgs: app.isPackaged ? [] : [app.getAppPath()],
      async onReserved() {
        await new Promise<void>((resolve, reject) => write(1, Buffer.from([1]), error => error ? reject(error) : resolve()));
        reserved = true;
      }
    });
  } catch (error) {
    if (reserved) dialog.showErrorBox('LastBrowser', app.getLocale().startsWith('de')
      ? 'Die Space-Migration wurde nicht abgeschlossen.'
      : 'Space migration did not finish.');
    throw error;
  }
}

if (process.platform === 'win32' && app.commandLine.hasSwitch(migrationWorkerSwitch)) {
  void runSpaceMigrationWorker().then(() => {
    app.relaunch({ args: app.isPackaged ? [] : [app.getAppPath()] });
    app.exit(0);
  }, () => app.exit(1));
} else if (process.platform === 'win32' && app.commandLine.hasSwitch(rendererStoreWorkerSwitch)) {
  const { runRendererStoreWorker } = await import('./renderer-store-worker.js');
  // Electron emits ready after loading the entry point.
  void runRendererStoreWorker(app.commandLine.getSwitchValue(rendererStoreWorkerSwitch)).catch(() => app.exit(1));
} else if (!await launchProtectedProfile()) await import('./main.js');
