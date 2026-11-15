import { createHash } from 'node:crypto';
import { constants, createReadStream } from 'node:fs';
import { copyFile, lstat, mkdir, mkdtemp, readdir, realpath, rename, rm } from 'node:fs/promises';
import path from 'node:path';

async function fileDigest(file: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

async function copyVerifiedTree(source: string, destination: string): Promise<void> {
  for (const name of await readdir(source)) {
    await copyVerifiedEntry(path.join(source, name), path.join(destination, name));
  }
}

async function copyVerifiedEntry(from: string, to: string): Promise<void> {
  const entry = await lstat(from);
  if (entry.isDirectory()) {
    await mkdir(to);
    await copyVerifiedTree(from, to);
  } else if (entry.isFile() && entry.nlink === 1) {
    await copyFile(from, to, constants.COPYFILE_EXCL);
    if (await fileDigest(from) !== await fileDigest(to)) {
      throw new Error('The staged space does not match its legacy data');
    }
  } else {
    throw new Error('Unsupported entry in the legacy space');
  }
}

async function statIfPresent(directory: string) {
  try {
    return await lstat(directory);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}

async function requireMissing(directory: string): Promise<void> {
  if (await statIfPresent(directory)) throw new Error('The staged space already exists');
}

async function verifyEntry(from: string, to: string): Promise<void> {
  const [source, target] = await Promise.all([lstat(from), lstat(to)]);
  if (source.isDirectory() && target.isDirectory()) {
    const [before, after] = await Promise.all([readdir(from), readdir(to)]);
    const afterSet = new Set(after);
    if (before.length === after.length && before.every(name => afterSet.has(name))) {
      for (const name of before) await verifyEntry(path.join(from, name), path.join(to, name));
      return;
    }
  } else if (source.isFile() && target.isFile() && source.nlink === 1 && target.nlink === 1
    && source.size === target.size && await fileDigest(from) === await fileDigest(to)) {
    return;
  }
  throw new Error('The staged space does not match its legacy data');
}

function contains(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return !relative || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

async function publishStagedDirectory(
  mount: string, destination: string, prepare: (staging: string) => Promise<void>
): Promise<void> {
  await requireMissing(destination);
  const staging = await mkdtemp(path.join(mount, '.space-migration-'));
  try {
    await prepare(staging);
    await requireMissing(destination);
    await rename(staging, destination);
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    throw error;
  }
}

/**
 * Copy one exclusively owned storage tree while all writers are stopped.
 * The caller must keep the authenticated encrypted mount and exclusive
 * migration lock alive until this call returns. Source retirement belongs
 * to the transaction that adopts the new storage roots.
 */
export async function stageSpaceDirectory(
  offlineSource: string, authenticatedMount: string, destinationName: string
): Promise<void> {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(destinationName)) throw new TypeError('Invalid migration destination');
  if (!(await lstat(offlineSource)).isDirectory()) throw new Error('Invalid legacy space root');
  const source = await realpath(offlineSource);
  const mount = await realpath(authenticatedMount);
  if (contains(source, mount) || contains(mount, source)) throw new Error('Space storage roots overlap');
  await publishStagedDirectory(mount, path.join(mount, destinationName), staging => copyVerifiedTree(source, staging));
}

/** Stage the selected Space's stores together on its authenticated mount. */
export async function stageSpaceProfile(
  legacyUserData: string, authenticatedMount: string,
  stores: ReadonlyArray<{ source: string; target: string; optional?: boolean }>
): Promise<string> {
  const legacy = await realpath(legacyUserData);
  const mount = await realpath(authenticatedMount);
  if (contains(legacy, mount) || contains(mount, legacy)) throw new Error('Space storage roots overlap');
  const destination = path.join(mount, 'profile');
  const existing = await statIfPresent(destination);
  if (existing && !existing.isDirectory()) throw new Error('Invalid staged profile directory');
  async function prepare(staging: string, verify: boolean) {
    for (const store of stores) {
      const source = path.resolve(store.source);
      const relative = path.relative(path.resolve(legacyUserData), source);
      const parts = store.target.split(/[\\/]/);
      if (!relative || !contains(path.resolve(legacyUserData), source)
        || parts.some(part => !/^[a-zA-Z0-9_~.-]+$/.test(part) || part.endsWith('.'))) {
        throw new Error('Invalid managed Space storage path');
      }

      const expected = path.join(legacy, relative);
      const target = path.join(staging, ...parts);
      let actual: string;
      try {
        actual = await realpath(expected);
      } catch (error) {
        if (store.optional && (error as NodeJS.ErrnoException).code === 'ENOENT') {
          if (verify) await requireMissing(target);
          continue;
        }
        throw error;
      }
      if (path.relative(expected, actual)) throw new Error('Managed Space storage is redirected');
      if (verify) {
        if (path.relative(target, await realpath(target))) throw new Error('Staged Space storage is redirected');
        await verifyEntry(expected, target);
      } else {
        await mkdir(path.dirname(target), { recursive: true });
        await copyVerifiedEntry(expected, target);
      }
    }
  }
  if (existing) await prepare(destination, true);
  else await publishStagedDirectory(mount, destination, staging => prepare(staging, false));
  return destination;
}
