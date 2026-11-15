import { lstat, readdir, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';

type ActiveVault = {
  id: string;
  envelope: unknown;
  vaultDirectory: string;
};

async function entry(directory: string) {
  try {
    return await lstat(directory);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    return null;
  }
}

export function protectedSpaceStore(profile: string): string {
  if (!path.isAbsolute(profile)) throw new Error('The browser profile path must be absolute');
  return path.join(profile, 'protected-spaces');
}

/** Locate the active pair before initializing the ordinary browser profile. */
export async function findWindowsProtectedPair(profile: string): Promise<string | null> {
  const store = protectedSpaceStore(profile);
  if (await entry(path.join(profile, '.protected-space-setup.lock'))) {
    throw new Error('Protected Space migration is in progress');
  }
  const storeEntry = await entry(store);
  if (!storeEntry) return null;
  const canonicalProfile = await realpath(profile);
  if (!storeEntry.isDirectory() || path.relative(protectedSpaceStore(canonicalProfile), await realpath(store))) {
    throw new Error('The protected Space store is redirected');
  }
  let active: string | null = null;
  for (const name of await readdir(store)) {
    if (!name.startsWith('space-pair-')) continue;
    const directory = path.join(store, name);
    if (!(await lstat(directory)).isDirectory()
      || path.relative(path.join(protectedSpaceStore(canonicalProfile), name), await realpath(directory))) {
      throw new Error('A protected Space pair is redirected');
    }
    if (await entry(path.join(directory, 'active-vaults.json'))) {
      if (active) throw new Error('Multiple active protected Space pairs were found');
      active = directory;
    } else if (await entry(path.join(directory, 'prepared-vaults.json'))) {
      throw new Error('Protected Space migration is in progress');
    }
  }
  return active;
}

export async function loadActiveSpaceConfiguration(directory: string) {
  if (!path.isAbsolute(directory)) throw new Error('The protected pair path must be absolute');
  const root = await realpath(directory);
  const file = path.join(root, 'active-vaults.json');
  const stat = await lstat(file);
  if (!stat.isFile() || stat.nlink !== 1 || stat.size > 16 * 1024) throw new Error('Invalid protected Space configuration');
  const configuration = JSON.parse(await readFile(file, 'utf8'));
  function parseVault(record: unknown): ActiveVault | null {
    if (!record || typeof record !== 'object') return null;
    const { id, envelope } = record as Partial<ActiveVault>;
    if (typeof id !== 'string' || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(id)
      || !envelope || typeof envelope !== 'object') return null;
    return { id, envelope, vaultDirectory: path.join(root, id) };
  }
  const primary = parseVault(configuration?.primary);
  const decoy = parseVault(configuration?.decoy);
  const nvSlot = configuration?.primary?.nvSlot;
  const wrappedPlatformSecret = configuration?.decoy?.wrappedPlatformSecret;
  if (configuration?.version !== 3 || configuration.state !== 'active' || !primary || !decoy || primary.id === decoy.id
    || !nvSlot || typeof nvSlot.index !== 'string' || !/^0150[0-9a-f]{4}$/.test(nvSlot.index)
    || typeof nvSlot.salt !== 'string' || !/^[A-Za-z0-9+/]{22}==$/.test(nvSlot.salt) || Object.keys(nvSlot).length !== 2
    || typeof wrappedPlatformSecret !== 'string' || !/^[A-Za-z0-9+/]{342}==$/.test(wrappedPlatformSecret)) {
    throw new Error('The protected Space pair is not active');
  }
  for (const vault of [primary, decoy]) {
    if (!(await lstat(vault.vaultDirectory)).isDirectory()
      || path.relative(vault.vaultDirectory, await realpath(vault.vaultDirectory))) {
      throw new Error('A protected vault directory is redirected');
    }
  }
  return { root, primary: { ...primary, nvSlot }, decoy: { ...decoy, wrappedPlatformSecret } };
}
