import { spawn } from 'node:child_process';
import { lstat, mkdtemp, realpath, rename, rm } from 'node:fs/promises';
import path from 'node:path';

/** All executable and library paths come from the trusted Windows launcher. */
export async function initializeWindowsSpaceVault(options: {
  java: string;
  libraryDirectory: string;
  initializerSource: string;
  vaultDirectory: string;
  vaultId: string;
  key: Buffer;
}): Promise<void> {
  const { java, libraryDirectory, initializerSource, vaultDirectory, vaultId, key } = options;
  if (process.platform !== 'win32' || ![java, libraryDirectory, initializerSource, vaultDirectory].every(path.isAbsolute)
    || key.length !== 32 || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(vaultId)) {
    throw new Error('Invalid Windows vault initialization parameters');
  }
  const parent = await realpath(path.dirname(vaultDirectory));
  const target = path.join(parent, path.basename(vaultDirectory));
  async function assertDestinationMissing() {
    try {
      await lstat(target);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw error;
    }
    throw new Error('The destination vault already exists');
  }
  await assertDestinationMissing();
  const staging = await mkdtemp(path.join(parent, '.vault-setup-'));
  try {
    const child = spawn(java, [
      '--class-path', path.join(libraryDirectory, '*'), initializerSource, staging, vaultId
    ], { stdio: ['pipe', 'ignore', 'ignore'], windowsHide: true });
    const keyCopy = Buffer.from(key);
    let failed = false;
    const deadline = setTimeout(() => { failed = true; child.kill(); }, 30_000);
    try {
      const exit = new Promise<number | null>(resolve => {
        child.once('error', () => { failed = true; });
        child.once('close', resolve);
        child.stdin.once('error', () => { failed = true; });
      });
      child.stdin.end(keyCopy, () => { keyCopy.fill(0); });
      if (await exit !== 0 || failed) throw new Error('The encrypted vault could not be initialized');
    } finally {
      clearTimeout(deadline);
      keyCopy.fill(0);
    }
    for (const file of ['vault.cryptomator', 'masterkey.cryptomator']) {
      if (!(await lstat(path.join(staging, file))).isFile()) throw new Error('The vault initializer did not create its configuration');
    }
    await assertDestinationMissing();
    await rename(staging, target);
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    throw error;
  }
}
