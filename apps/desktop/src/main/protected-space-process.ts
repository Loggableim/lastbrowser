import { spawn } from 'node:child_process';
import { lstat, mkdir, realpath } from 'node:fs/promises';
import path from 'node:path';

export type MountedSpace = {
  root: string;
  /** Resolves if the storage provider stops serving the mount. */
  closed: Promise<void>;
  /** Waits until the vault is no longer accessible. */
  close(): Promise<void>;
};

/** Run one browser for a mount owned by the trusted storage provider. */
export async function runProtectedSpaceProcess(
  executable: string, args: readonly string[], mount: () => Promise<MountedSpace>, onMounted?: () => void
): Promise<number> {
  if (!path.isAbsolute(executable) || args.some(arg => arg === '--'
    || /^--(?:user-data-dir|lastbrowser-protected-profile|remote-debugging-(?:port|pipe|address))(?:=|$)/i.test(arg))) {
    throw new Error('Invalid protected browser launch arguments');
  }
  const volume = await mount();
  try {
    if (!path.isAbsolute(volume.root) || !(await lstat(volume.root)).isDirectory()) {
      throw new Error('Protected mount is unavailable');
    }
    const root = await realpath(volume.root);
    if (path.relative(volume.root, root)) throw new Error('Protected mount is redirected');
    const temp = path.join(root, 'temp');
    await mkdir(temp, { recursive: true });
    if (path.relative(temp, await realpath(temp))) throw new Error('Protected temporary directory is redirected');
    const env: NodeJS.ProcessEnv = { ...process.env, TEMP: temp, TMP: temp, TMPDIR: temp };
    for (const name of ['ELECTRON_RUN_AS_NODE', 'LASTBROWSER_ENABLE_CDP', 'LASTBROWSER_CDP_PORT', 'CDP_PORT']) {
      delete env[name];
    }

    onMounted?.();
    const child = spawn(executable, [
      ...args, `--user-data-dir=${root}`, `--lastbrowser-protected-profile=${root}`
    ], { env, stdio: 'ignore', windowsHide: true });
    const finished = new Promise<{ code: number | null; error?: Error }>(resolve => {
      child.once('error', error => resolve({ code: null, error }));
      child.once('close', code => resolve({ code }));
    });
    const outcome = await Promise.race([
      finished,
      volume.closed.then(() => null, () => null)
    ]);
    if (!outcome) {
      child.kill();
      await finished;
      throw new Error('The protected mount closed while the browser was running');
    }
    if (outcome.error) throw outcome.error;
    return outcome.code ?? 1;
  } finally {
    await volume.close();
  }
}
