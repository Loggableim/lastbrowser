import { randomUUID } from 'node:crypto';
import { lstat, open, readFile, rename, unlink } from 'node:fs/promises';
import path from 'node:path';

const localStateFile = 'Local State';
type ChromiumKeys = { os_crypt: { encrypted_key?: string; app_bound_encrypted_key?: string; audit_enabled?: boolean } };

async function readLocalState(profile: string): Promise<string | null> {
  const file = path.join(profile, localStateFile);
  try {
    const stat = await lstat(file);
    if (!stat.isFile() || stat.nlink !== 1 || stat.size > 16 * 1024 * 1024) throw new Error('Invalid Chromium Local State');
    return await readFile(file, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    return null;
  }
}

/** Preserve the wrapped Chromium cookie keys without copying unrelated browser metadata. */
export async function readWindowsChromiumKeys(profile: string): Promise<ChromiumKeys | null> {
  const original = await readLocalState(profile);
  if (original === null) return null;
  const source: unknown = JSON.parse(original)?.os_crypt;
  if (source === undefined) return null;
  if (!source || typeof source !== 'object' || Array.isArray(source)) throw new Error('Invalid Chromium key preferences');
  const entries = source as Record<string, unknown>;
  const os_crypt: ChromiumKeys['os_crypt'] = {};
  for (const key of ['encrypted_key', 'app_bound_encrypted_key'] as const) {
    const value = entries[key];
    if (value === undefined || value === '') continue;
    if (typeof value !== 'string' || value.length > 8192 || !/^[a-z0-9+/]+={0,2}$/i.test(value)) {
      throw new Error('Invalid Chromium wrapped key preference');
    }
    os_crypt[key] = value;
  }
  if (typeof entries.audit_enabled === 'boolean') os_crypt.audit_enabled = entries.audit_enabled;
  return os_crypt.encrypted_key || os_crypt.app_bound_encrypted_key ? { os_crypt } : null;
}

/** Store the selected preferences in the vault root before Chromium can generate a different key. */
export async function stageWindowsChromiumKeys(profile: string, keys: ChromiumKeys | null): Promise<void> {
  const previous = await readLocalState(profile);
  if (!keys) {
    if (previous !== null) throw new Error('The staged Chromium keys do not match');
    return;
  }
  const expected = JSON.stringify(keys);
  if (previous !== null) {
    if (previous !== expected) throw new Error('The staged Chromium keys do not match');
    return;
  }
  const pending = path.join(profile, `.chromium-keys-${randomUUID()}`);
  try {
    const file = await open(pending, 'wx', 0o600);
    try {
      await file.writeFile(expected, 'utf8');
      await file.sync();
    } finally {
      await file.close();
    }
    await rename(pending, path.join(profile, localStateFile));
  } catch (error) {
    await unlink(pending).catch(() => {});
    throw error;
  }
}
