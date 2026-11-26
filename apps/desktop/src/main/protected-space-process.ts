import { spawn } from 'node:child_process';
import { realpathSync, writeSync } from 'node:fs';
import { lstat, mkdir } from 'node:fs/promises';
import { Socket } from 'node:net';
import path from 'node:path';
import { createInterface } from 'node:readline';
import type { Readable, Writable } from 'node:stream';

export const protectedSpaceLinksSwitch = 'lastbrowser-protected-links';
export const protectedSpaceLinkAck = 'LASTBROWSER-LINK-ACK';

/** Electron GUI processes on Windows receive the inherited pipe at fd 0. */
export function readProtectedSpaceLinks(
  openUrl: (url: string, onDelivered: () => void) => void,
  input?: Readable,
  acknowledge = () => {
    try { writeSync(1, protectedSpaceLinkAck + '\n'); } catch { /* The launcher may have closed. */ }
  }
): () => void {
  try {
    input ??= new Socket({ fd: 0, readable: true, writable: false });
  } catch {
    return () => {};
  }
  const relay = createInterface({ input, crlfDelay: Infinity });
  const stop = () => {
    relay.close();
    input.destroy();
  };
  relay.on('error', stop);
  relay.on('line', line => {
    let value: unknown;
    try { value = JSON.parse(line); } catch { return; }
    if (typeof value === 'string' && /^(?:https?|file):\/\//i.test(value)) openUrl(value, acknowledge);
  });
  return stop;
}

export type MountedSpace = {
  root: string;
  /** Resolves if the storage provider stops serving the mount. */
  closed: Promise<void>;
  /** Waits until the vault is no longer accessible. */
  close(): Promise<void>;
};

/** Run one browser for a mount owned by the trusted storage provider. */
export async function runProtectedSpaceProcess(
  executable: string, args: readonly string[], mount: () => Promise<MountedSpace>, onMounted?: () => void,
  onBrowserStarted?: (input: Writable, acknowledgements: Readable) => void
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
    // Resolve mount paths component by component on WinFsp.
    const root = realpathSync(volume.root);
    if (path.relative(volume.root, root)) throw new Error('Protected mount is redirected');
    const temp = path.join(root, 'temp');
    await mkdir(temp, { recursive: true });
    if (path.relative(temp, realpathSync(temp))) throw new Error('Protected temporary directory is redirected');
    const env: NodeJS.ProcessEnv = { ...process.env, TEMP: temp, TMP: temp, TMPDIR: temp };
    for (const name of ['ELECTRON_RUN_AS_NODE', 'LASTBROWSER_ENABLE_CDP', 'LASTBROWSER_CDP_PORT', 'CDP_PORT']) {
      delete env[name];
    }

    onMounted?.();
    const launchArgs = [...args, `--user-data-dir=${root}`, `--lastbrowser-protected-profile=${root}`];
    if (onBrowserStarted) launchArgs.push(`--${protectedSpaceLinksSwitch}`);
    const child = spawn(executable, launchArgs, {
      env, stdio: [onBrowserStarted ? 'pipe' : 'ignore', onBrowserStarted ? 'pipe' : 'ignore', 'ignore'], windowsHide: true
    });
    const finished = new Promise<{ code: number | null; error?: Error }>(resolve => {
      child.once('error', error => resolve({ code: null, error }));
      child.once('close', code => resolve({ code }));
    });
    if (child.stdin && child.stdout && onBrowserStarted) {
      child.stdin.on('error', () => {});
      try {
        onBrowserStarted(child.stdin, child.stdout);
      } catch (error) {
        child.kill();
        await finished;
        throw error;
      }
    }
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
