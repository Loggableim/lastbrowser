import { spawn } from 'node:child_process';
import { existsSync, lstatSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import type { MountedSpace } from './protected-space-process.js';

const readyMessage = 'LASTBROWSER_VAULT_READY';

async function waitFor(condition: () => boolean, timeoutMs: number, message: string): Promise<void> {
  const deadline = performance.now() + timeoutMs;
  while (!condition()) {
    if (performance.now() >= deadline) throw new Error(message);
    await delay(100);
  }
}

export type WindowsVaultRuntime = {
  /** Trusted, package-controlled paths. */
  java: string;
  libraryDirectory: string;
  initializerSource: string;
  drive: string;
};

type WindowsVault = WindowsVaultRuntime & {
  vaultDirectory: string;
  vaultId: string;
  /** The caller's 256-bit random volume key. */
  key: Buffer;
  /** The caller will stage the initial profile in this authenticated volume. */
  preparingProfile?: boolean;
};

/** Open a provisioned Cryptomator vault using the native Windows filesystem provider. */
export async function mountWindowsSpaceVault({
  java, libraryDirectory, initializerSource, vaultDirectory, drive, vaultId, key, preparingProfile = false
}: WindowsVault): Promise<MountedSpace> {
  if (process.platform !== 'win32') throw new Error('The WinFsp provider requires Windows');
  if (!/^[D-Z]:\\$/i.test(drive) || existsSync(drive)) throw new Error('Select an unused drive root for the protected vault');
  if (![java, libraryDirectory, initializerSource, vaultDirectory].every(path.isAbsolute)
    || !lstatSync(vaultDirectory).isDirectory()
    || !lstatSync(path.join(vaultDirectory, 'vault.cryptomator'), { throwIfNoEntry: false })?.isFile()
    || !lstatSync(path.join(vaultDirectory, 'masterkey.cryptomator'), { throwIfNoEntry: false })?.isFile()) {
    throw new Error('The encrypted vault configuration is missing');
  }
  if (!/^[0-9a-f-]{36}$/.test(vaultId) || key.length !== 32) throw new Error('Invalid vault identity or key');

  const child = spawn(java, [
    '--enable-native-access=ALL-UNNAMED', '--class-path', path.join(libraryDirectory, '*'),
    initializerSource, 'mount', vaultDirectory, drive
  ], { stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true });
  let stopped = false;
  let exitCode: number | null = null;
  let ready = false;
  let tail = '';
  let watch: ReturnType<typeof setInterval> | undefined;
  let markLost: () => void = () => {};
  const lost = new Promise<void>(resolve => { markLost = resolve; });
  const closed = new Promise<void>(resolve => {
    child.once('close', code => {
      exitCode = code;
      stopped = true;
      clearInterval(watch);
      resolve();
    });
    child.on('error', () => { stopped = true; });
  });
  child.stdout.on('data', chunk => {
    const output = tail + chunk.toString('utf8');
    ready ||= output.includes(readyMessage);
    tail = ready ? '' : output.slice(-readyMessage.length);
  });
  child.stdin.on('error', () => { /* Readiness and exit detect a failed helper. */ });
  async function close() {
    clearInterval(watch);
    if (!stopped) child.stdin.end();
    try {
      await waitFor(() => stopped && !existsSync(drive), 15_000, 'The protected drive did not dismount');
    } catch (error) {
      if (!stopped) child.kill();
      throw error;
    }
    if (exitCode !== 0) throw new Error('The protected drive did not close cleanly');
  }

  try {
    const keyCopy = Buffer.from(key);
    child.stdin.write(keyCopy, () => { keyCopy.fill(0); });
    await waitFor(() => stopped || (ready && existsSync(drive)), 60_000, 'The protected drive did not become available');
    if (stopped) throw new Error('The Windows vault helper exited before mounting');
    const binding = path.join(drive, 'lastbrowser-vault-id');
    const profile = path.join(drive, 'profile');
    const profileInfo = lstatSync(profile, { throwIfNoEntry: false });
    const bindingInfo = lstatSync(binding, { throwIfNoEntry: false });
    if (!bindingInfo?.isFile() || bindingInfo.size !== 36
      || readFileSync(binding, 'ascii') !== vaultId
      || (!profileInfo && !preparingProfile) || (profileInfo && !profileInfo.isDirectory())) {
      throw new Error('The mounted profile does not match the selected vault');
    }
    const root = preparingProfile ? drive : profile;
    watch = setInterval(() => { if (!existsSync(root)) markLost(); }, 250);
    watch.unref();
    return { root, closed: Promise.race([closed, lost]), close };
  } catch (error) {
    await close().catch(() => {});
    throw error;
  }
}
