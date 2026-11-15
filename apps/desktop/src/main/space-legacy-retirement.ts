import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { lstat, mkdir, open, readFile, realpath, rename, rm, unlink } from 'node:fs/promises';
import path from 'node:path';

async function entryAt(filename: string) {
  try {
    return await lstat(filename);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}

async function writeReceipt(filename: string, value: Buffer): Promise<void> {
  const pending = `${filename}.${randomUUID()}.tmp`;
  const file = await open(pending, 'wx', 0o600);
  try {
    await file.writeFile(value);
    await file.sync();
  } finally {
    await file.close();
  }
  try {
    await rename(pending, filename);
  } catch (error) {
    await unlink(pending);
    throw error;
  }
}

/** Retire verified app-owned files under an exclusive offline migration lock. */
export async function retireMigratedSpaceStores(options: {
  root: string;
  stores: readonly string[];
  transactionId: string;
  /** Stable secret kept outside the legacy filesystem journal. */
  journalKey: Buffer;
  verifyCopies: () => Promise<void>;
}): Promise<void> {
  const { root, stores, transactionId, journalKey, verifyCopies } = options;
  if (!path.isAbsolute(root) || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(transactionId)
    || journalKey.length !== 32 || !stores.length) throw new Error('Invalid legacy retirement transaction');
  const canonicalRoot = await realpath(root);
  const names = stores.map(store => {
    const relative = path.relative(root, store);
    if (!path.isAbsolute(store) || path.isAbsolute(relative)
      || relative.split(path.sep).some(part => !/^[a-zA-Z0-9_~.-]+$/.test(part) || part.endsWith('.'))
      || relative.startsWith('.protected-retirement-')) throw new Error('Invalid legacy storage path');
    return relative;
  }).sort();
  const normalized = names.map(value => value.toLowerCase());
  if (new Set(normalized).size !== normalized.length
    || normalized.some(value => normalized.some(other => other.startsWith(`${value}${path.sep}`)))) {
    throw new Error('Overlapping legacy storage paths');
  }
  const journal = path.join(canonicalRoot, `.protected-retirement-${transactionId}`);
  const approved = path.join(journal, 'approved');
  const complete = path.join(journal, 'complete');
  const body = JSON.stringify([canonicalRoot, transactionId, names]);
  const seal = (phase: string) => createHmac('sha256', journalKey).update(phase).update(body).digest();
  async function validReceipt(file: string, phase: string) {
    const stat = await entryAt(file);
    if (!stat) return false;
    if (!stat.isFile() || stat.nlink !== 1 || stat.size !== 32
      || !timingSafeEqual(await readFile(file), seal(phase))) throw new Error('The retirement journal does not match the selected stores');
    return true;
  }
  async function sourceAt(relative: string) {
    const source = path.join(canonicalRoot, relative);
    const stat = await entryAt(source);
    if (stat && ((!stat.isFile() && !stat.isDirectory()) || path.relative(source, await realpath(source)))) {
      throw new Error('Legacy storage is redirected');
    }
    return { source, stat };
  }
  await mkdir(journal, { recursive: true });
  if (!(await lstat(journal)).isDirectory() || path.relative(journal, await realpath(journal))) {
    throw new Error('Legacy retirement journal is redirected');
  }
  if (await validReceipt(complete, 'complete')) {
    for (const name of names) {
      if ((await sourceAt(name)).stat) throw new Error('Retired legacy data reappeared');
    }
    return;
  }
  if (!await validReceipt(approved, 'approved')) {
    for (const name of names) await sourceAt(name);
    await verifyCopies();
    await writeReceipt(approved, seal('approved'));
  }
  for (const [index, name] of names.entries()) {
    const { source, stat } = await sourceAt(name);
    const quarantine = path.join(journal, `store-${index}`);
    const renamed = await entryAt(quarantine);
    if (renamed && (stat || (!renamed.isFile() && !renamed.isDirectory()))) {
      throw new Error('Invalid quarantined legacy storage');
    }
    if (stat) await rename(source, quarantine);
    if (stat || renamed) await rm(quarantine, { recursive: true, force: false });
  }
  await writeReceipt(complete, seal('complete'));
}
