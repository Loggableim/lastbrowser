import { spawn } from 'node:child_process';
import { migrationWorkerSwitch } from './windows-space-migration-request.js';

/** The worker acknowledges only after reserving the offline profile. */
export async function launchWindowsSpaceMigration(executable: string, args: readonly string[], frame: Buffer): Promise<void> {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.NODE_OPTIONS;
  const child = spawn(executable, [...args, `--${migrationWorkerSwitch}=${process.pid}`], {
    env, stdio: ['pipe', 'pipe', 'ignore'], detached: true, windowsHide: true
  });
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await new Promise<void>((resolve, reject) => {
      const failed = () => reject(new Error('The offline migration could not reserve the browser profile'));
      child.once('error', failed);
      child.once('close', failed);
      child.stdin.once('error', failed);
      child.stdout.once('data', (chunk: Buffer) => {
        if (chunk.length === 1 && chunk[0] === 1) resolve();
        else failed();
      });
      timeout = setTimeout(failed, 10000);
      child.stdin.end(frame, () => frame.fill(0));
    });
    child.unref();
    child.stdout.destroy();
  } catch (error) {
    // EOF lets the worker release any reservation before exiting.
    child.stdin.destroy();
    child.stdout.destroy();
    child.unref();
    throw error;
  } finally {
    frame.fill(0);
    clearTimeout(timeout);
  }
}
