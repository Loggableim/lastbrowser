import { spawn } from 'node:child_process';
import path from 'node:path';

export const rendererStoreWorkerSwitch = 'lastbrowser-renderer-store-worker';
export type RendererStoreSnapshot = Readonly<Record<string, string>>;
const maxSnapshotBytes = 20 * 1024 * 1024;

export function encodeRendererStoreSnapshot(snapshot: RendererStoreSnapshot): Buffer {
  const buffer = Buffer.from(JSON.stringify(snapshot), 'utf8');
  if (buffer.length <= maxSnapshotBytes) return buffer;
  buffer.fill(0);
  throw new Error('The renderer store exceeds the migration limit');
}

export async function readRendererStoreSnapshot(input: AsyncIterable<Buffer>): Promise<RendererStoreSnapshot> {
  const chunks: Buffer[] = [];
  let length = 0;
  let buffer: Buffer | undefined;
  try {
    for await (const chunk of input) {
      chunks.push(chunk);
      length += chunk.length;
      if (length > maxSnapshotBytes) throw new Error('The renderer store exceeds the migration limit');
    }
    buffer = Buffer.concat(chunks, length);
    let snapshot: unknown;
    try {
      snapshot = JSON.parse(buffer.toString('utf8'));
    } catch {
      throw new Error('Invalid renderer store snapshot');
    }
    if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)
      || Object.values(snapshot).some(value => typeof value !== 'string')) throw new Error('Invalid renderer store snapshot');
    return snapshot as RendererStoreSnapshot;
  } finally {
    buffer?.fill(0);
    for (const chunk of chunks) chunk.fill(0);
  }
}

/** Use only with closed legacy profiles or directories reserved for a new store. */
export function createRendererStoreWorker(executable: string, browserArgs: readonly string[]) {
  async function run(profile: string, request?: RendererStoreSnapshot) {
    if (!path.isAbsolute(executable) || !path.isAbsolute(profile)) throw new Error('Invalid renderer store worker path');
    const encoded = request && encodeRendererStoreSnapshot(request);
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    delete env.NODE_OPTIONS;
    const child = spawn(executable, [
      ...browserArgs, `--user-data-dir=${profile}`, `--${rendererStoreWorkerSwitch}=${encoded ? 'build' : 'read'}`
    ], { env, windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] });
    const completion = new Promise<number | null>(resolve => {
      child.once('error', () => resolve(null));
      child.once('close', resolve);
      child.stdin.once('error', () => child.kill());
    });
    const deadline = setTimeout(() => child.kill(), 25_000);
    try {
      child.stdin.end(encoded, () => encoded?.fill(0));
      if (encoded) child.stdout.resume();
      const result = encoded ? undefined : await readRendererStoreSnapshot(child.stdout);
      if (await completion !== 0) throw new Error('The Chromium renderer store worker failed');
      return result;
    } catch {
      child.kill();
      await completion;
      throw new Error('The Chromium renderer store worker failed');
    } finally {
      clearTimeout(deadline);
      encoded?.fill(0);
    }
  }
  return {
    async read(profile: string): Promise<RendererStoreSnapshot> {
      const result = await run(profile);
      if (!result) throw new Error('The Chromium renderer store snapshot is missing');
      return result;
    },
    async build(profile: string, values: RendererStoreSnapshot): Promise<void> { await run(profile, values); }
  };
}
