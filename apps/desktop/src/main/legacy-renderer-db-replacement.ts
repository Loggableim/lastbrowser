import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, mkdtemp, open, readFile, readdir, realpath, rename, rm, unlink } from 'node:fs/promises';
import path from 'node:path';

async function plainDirectory(directory: string): Promise<boolean> {
  try {
    const stat = await lstat(directory);
    if (!stat.isDirectory() || path.relative(directory, await realpath(directory))) {
      throw new Error('A legacy renderer store path is redirected');
    }
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

async function rendererStorePaths(root: string, transactionId: string) {
  if (!path.isAbsolute(root) || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(transactionId)) {
    throw new Error('Invalid legacy renderer replacement transaction');
  }
  const storage = path.join(await realpath(root), 'Local Storage');
  if (!await plainDirectory(storage)) throw new Error('The legacy Local Storage directory is unavailable');
  return {
    storage, live: path.join(storage, 'leveldb'), next: path.join(storage, `.protected-next-${transactionId}`),
    old: path.join(storage, `.protected-old-${transactionId}`)
  };
}

async function databaseDigest(directory: string): Promise<string> {
  if (!await plainDirectory(directory)) throw new Error('The rebuilt renderer database is unavailable');
  const digest = createHash('sha256');
  const files = (await readdir(directory)).sort();
  if (!files.length) throw new Error('The rebuilt renderer database is empty');
  for (const name of files) {
    const file = path.join(directory, name);
    const stat = await lstat(file);
    if (!stat.isFile() || stat.nlink !== 1) throw new Error('The rebuilt renderer database contains a redirected entry');
    const contents = createHash('sha256');
    for await (const chunk of createReadStream(file)) contents.update(chunk);
    digest.update(JSON.stringify([name, contents.digest('hex')]));
  }
  return digest.digest('hex');
}

type StoreSnapshot = Readonly<Record<string, string>>;
type RendererStoreMigration = {
  expectedLegacyValues: Readonly<Record<string, string | null>>;
  legacyUpdates: Readonly<Record<string, string | null>>;
  /** Read the trusted LastBrowser Chromium origin after its previous writer has closed. */
  read: (profile: string) => Promise<StoreSnapshot>;
  /** Start a separate Chromium instance and close it after writing the new store. */
  build: (profile: string, values: StoreSnapshot) => Promise<void>;
};

/** Use the offline Chromium adapter to build a fresh store without writing protected records. */
export async function stageLegacyRendererStore(options: RendererStoreMigration & {
  root: string; transactionId: string; journalKey: Buffer;
}) {
  const { root, transactionId, journalKey, expectedLegacyValues, legacyUpdates, read, build } = options;
  const { storage, live, next, old } = await rendererStorePaths(root, transactionId);
  if (journalKey.length !== 32) throw new Error('Invalid renderer migration journal key');
  const receipt = path.join(storage, `.protected-verified-${transactionId}`);
  const seal = (digest: Buffer) => createHmac('sha256', journalKey)
    .update(JSON.stringify(['LastBrowser renderer replacement v1', storage, transactionId])).update(digest).digest();
  async function readReceipt(): Promise<string | undefined> {
    try {
      const stat = await lstat(receipt);
      if (!stat.isFile() || stat.nlink !== 1 || stat.size !== 64) throw new Error('Invalid renderer migration journal');
      const signed = await readFile(receipt);
      const digest = signed.subarray(0, 32);
      if (signed.length !== 64 || !timingSafeEqual(signed.subarray(32), seal(digest))) {
        throw new Error('Invalid renderer migration journal');
      }
      return digest.toString('hex');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      return undefined;
    }
  }
  async function writeReceipt(value: string) {
    const digest = Buffer.from(value, 'hex');
    const temporary = `${receipt}.${randomUUID()}.tmp`;
    try {
      const file = await open(temporary, 'wx', 0o600);
      try {
        await file.writeFile(Buffer.concat([digest, seal(digest)]));
        await file.sync();
      } finally {
        await file.close();
      }
      await rename(temporary, receipt);
    } catch (error) {
      await unlink(temporary).catch(() => {});
      throw error;
    }
  }
  const verifier = (verified: string) => async (directory: string) => {
    if (await databaseDigest(directory) !== verified) throw new Error('The verified renderer database changed before adoption');
  };
  const [hasLive, hasNext, hasOld, existing] = await Promise.all([
    plainDirectory(live), plainDirectory(next), plainDirectory(old), readReceipt()
  ]);
  if (hasNext || hasOld) {
    if (!existing) throw new Error('The renderer migration journal is missing');
    const verify = verifier(existing);
    await verify(hasNext ? next : live);
    return verify;
  }
  if (!hasLive) {
    throw new Error('The legacy renderer database is not ready for a new migration');
  }
  if (existing && await databaseDigest(live) === existing) return verifier(existing);
  const snapshot = new Map(Object.entries(await read(root)));
  for (const [key, value] of Object.entries(legacyUpdates)) {
    if (!Object.hasOwn(expectedLegacyValues, key) || (snapshot.get(key) ?? null) !== expectedLegacyValues[key]) {
      throw new Error('The legacy renderer data changed since the Spaces were selected');
    }
    if (value === null) snapshot.delete(key);
    else snapshot.set(key, value);
  }
  const retained = Object.fromEntries(snapshot);
  const scratch = await mkdtemp(path.join(storage, '.protected-renderer-build-'));
  let verified: string;
  try {
    await build(scratch, retained);
    const reopened = await read(scratch);
    if (Object.keys(reopened).length !== snapshot.size || Object.entries(reopened).some(([key, value]) => snapshot.get(key) !== value)) {
      throw new Error('Chromium did not recover the expected renderer data');
    }
    const candidate = path.join(scratch, 'Local Storage', 'leveldb');
    verified = await databaseDigest(candidate);
    if (await plainDirectory(next)) throw new Error('A renderer database is already staged');
    await writeReceipt(verified);
    await rename(candidate, next);
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
  return verifier(verified);
}

/**
 * Replace Chromium's shared Local Storage database while Chromium is stopped.
 * The caller builds the new LevelDB using Chromium in the sibling
 * .protected-next-<transactionId> directory and supplies an on-disk verifier.
 */
export async function replaceLegacyRendererStore(options: {
  root: string;
  transactionId: string;
  verify: (directory: string) => Promise<void>;
}): Promise<void> {
  const { root, transactionId, verify } = options;
  const { live, next, old } = await rendererStorePaths(root, transactionId);
  const [hasLive, hasNext, hasOld] = await Promise.all([live, next, old].map(plainDirectory));
  if ((!hasLive && !hasNext) || (hasLive && hasNext && hasOld)) {
    throw new Error('The legacy renderer replacement has conflicting directories');
  }
  if (hasNext) {
    await verify(next);
    if (hasLive) await rename(live, old);
    await rename(next, live);
  }
  await verify(live);
  if ((hasOld || (hasNext && hasLive)) && await plainDirectory(old)) {
    await rm(old, { recursive: true, force: false });
  }
}
