import { randomUUID } from 'node:crypto';
import { lstat, open, readFile, rename, unlink } from 'node:fs/promises';
import path from 'node:path';

const keys = new Set([
  'lastbrowser.activeProfile.v1', 'lastbrowser.activeSpacePath.v1',
  'lastbrowser.profiles.v1', 'lastbrowser.tabSessions.v1', 'lastbrowser.snapGroups.v1',
  'lastbrowser.sessionSnapshot.v1', 'lastbrowser.bookmarks.v1'
]);
const maxBytes = 8 * 1024 * 1024;

function encode(values: unknown): string {
  if (!values || typeof values !== 'object' || Array.isArray(values)
    || Object.entries(values).some(([key, value]) => !keys.has(key) || typeof value !== 'string')) {
    throw new Error('Invalid protected renderer migration data');
  }
  const body = JSON.stringify(values);
  if (Buffer.byteLength(body, 'utf8') > maxBytes) throw new Error('Protected renderer migration data exceeds the size limit');
  return body;
}

export async function loadProtectedRendererSeed(root: string): Promise<Record<string, string> | null> {
  const file = path.join(root, 'renderer-migration.json');
  try {
    const stat = await lstat(file);
    if (!stat.isFile() || stat.nlink !== 1 || stat.size > maxBytes) throw new Error('Invalid protected renderer migration file');
    const values: unknown = JSON.parse(await readFile(file, 'utf8'));
    return JSON.parse(encode(values));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

/** Only call after the authenticated encrypted mount is open. */
export async function writeProtectedRendererSeed(root: string, values: Readonly<Record<string, string>>): Promise<void> {
  const body = encode(values);
  const temporary = path.join(root, `.renderer-migration-${randomUUID()}`);
  try {
    const file = await open(temporary, 'wx', 0o600);
    try {
      await file.writeFile(body, 'utf8');
      await file.sync();
    } finally {
      await file.close();
    }
    await rename(temporary, path.join(root, 'renderer-migration.json'));
  } catch (error) {
    await unlink(temporary).catch(() => {});
    throw error;
  }
}
