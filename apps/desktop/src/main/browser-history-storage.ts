import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, rename, unlink, writeFile } from 'node:fs/promises';

export type BrowserVisit = { url: string; title: string; count: number; lastVisited: number; profileId?: string };
export type BrowserHistoryMergeResult = { persisted: true; added: number; updated: number; invalid: number; total: number };
export type BrowserHistoryReplaceResult = { persisted: true; total: number };
const maxStoreBytes = 256 * 1024 * 1024;

function checkedProfileId(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/.test(value)) throw new Error('Invalid browser history profile.');
  return value;
}

function normalizeEntry(value: unknown, profileId: string): BrowserVisit | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const entry = value as Partial<BrowserVisit>;
  if (entry.profileId !== undefined && entry.profileId !== profileId) throw new Error('History belongs to a different browser profile.');
  if (typeof entry.url !== 'string' || entry.url.length > 65536) return null;
  let url: URL;
  try { url = new URL(entry.url); } catch { return null; }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return null;
  if (entry.title !== undefined && (typeof entry.title !== 'string' || entry.title.length > 65536)) return null;
  if (typeof entry.count !== 'number' || !Number.isFinite(entry.count) || entry.count < 1 || entry.count > Number.MAX_SAFE_INTEGER) return null;
  if (typeof entry.lastVisited !== 'number' || !Number.isFinite(entry.lastVisited) || entry.lastVisited < 0 || entry.lastVisited > 8640000000000000) return null;
  return { url: url.toString().replace(/\/$/, ''), title: (entry.title || '').trim() || url.hostname,
    count: Math.floor(entry.count), lastVisited: entry.lastVisited, profileId };
}

function sortVisits(visits: BrowserVisit[]): BrowserVisit[] {
  return visits.sort((left, right) => right.count - left.count || right.lastVisited - left.lastVisited || left.url.localeCompare(right.url));
}

/** Main owns userData and profile authorization. Renderer requests never carry file paths.
 * There is no entry-count cap. The explicit byte safety bound fails without
 * overwriting existing history; it never reports a partial write as complete.
 */
export class BrowserHistoryStorage {
  private readonly directory: string;
  private readonly queues = new Map<string, Promise<unknown>>();

  constructor(userDataDirectory: string) {
    if (!path.isAbsolute(userDataDirectory)) throw new Error('History storage requires Main-owned user data.');
    this.directory = path.join(path.resolve(userDataDirectory), 'browser-history');
  }

  private file(profileId: string): string {
    return path.join(this.directory, `${createHash('sha256').update(checkedProfileId(profileId)).digest('hex')}.json`);
  }

  private exclusive<T>(profileId: string, action: () => Promise<T>): Promise<T> {
    checkedProfileId(profileId);
    const previous = this.queues.get(profileId) || Promise.resolve();
    const result = previous.catch(() => {}).then(action);
    this.queues.set(profileId, result);
    void result.finally(() => { if (this.queues.get(profileId) === result) this.queues.delete(profileId); }).catch(() => {});
    return result;
  }

  private async read(profileId: string): Promise<BrowserVisit[]> {
    let handle: Awaited<ReturnType<typeof open>>;
    try { handle = await open(this.file(profileId), 'r'); }
    catch (error: unknown) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return [];
      throw new Error('Full browser history could not be opened. Existing data was preserved.');
    }
    try {
      const info = await handle.stat();
      if (!info.isFile() || info.size > maxStoreBytes) throw new Error('History store exceeds the supported byte limit.');
      const bytes = Buffer.alloc(info.size + 1);
      let read = 0;
      while (read < bytes.length) {
        const chunk = await handle.read(bytes, read, bytes.length - read, read);
        if (!chunk.bytesRead) break;
        read += chunk.bytesRead;
      }
      if (read > info.size) throw new Error('History changed while loading.');
      const envelope = JSON.parse(bytes.subarray(0, read).toString('utf8')) as { schemaVersion?: unknown; profileId?: unknown; entries?: unknown };
      if (envelope.schemaVersion !== 1 || envelope.profileId !== profileId || !Array.isArray(envelope.entries)) throw new Error('Invalid history store.');
      const entries = envelope.entries.map((entry) => normalizeEntry(entry, profileId));
      if (entries.some((entry) => !entry)) throw new Error('Invalid saved history entry.');
      return sortVisits(entries as BrowserVisit[]);
    } catch {
      throw new Error('Full browser history could not be read. Existing data was preserved.');
    } finally { await handle.close(); }
  }

  private async write(profileId: string, entries: BrowserVisit[]): Promise<void> {
    const payload = JSON.stringify({ schemaVersion: 1, profileId, entries });
    if (Buffer.byteLength(payload, 'utf8') > maxStoreBytes) throw new Error('Full history exceeds the 256 MiB storage safety limit. Nothing was truncated or overwritten.');
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const file = this.file(profileId), temporary = `${file}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, payload, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
      await rename(temporary, file);
    } catch {
      await unlink(temporary).catch(() => {});
      throw new Error('Full browser history could not be saved. Existing data was preserved.');
    }
  }

  load(profileId: string): Promise<BrowserVisit[]> {
    return this.exclusive(profileId, () => this.read(profileId));
  }

  /** Repeated imports are idempotent: retain the highest observed visit count. */
  merge(profileId: string, entries: unknown): Promise<BrowserHistoryMergeResult> {
    if (!Array.isArray(entries)) return Promise.reject(new Error('History entries must be an array.'));
    return this.exclusive(profileId, async () => {
      const current = await this.read(profileId);
      const indexed = new Map(current.map((entry) => [entry.url, entry]));
      let added = 0, updated = 0, invalid = 0;
      for (const value of entries) {
        const incoming = normalizeEntry(value, profileId);
        if (!incoming) { invalid += 1; continue; }
        const previous = indexed.get(incoming.url);
        if (!previous) { indexed.set(incoming.url, incoming); added += 1; continue; }
        const next = { ...previous, count: Math.max(previous.count, incoming.count), lastVisited: Math.max(previous.lastVisited, incoming.lastVisited),
          title: incoming.lastVisited >= previous.lastVisited ? incoming.title : previous.title };
        if (next.count !== previous.count || next.lastVisited !== previous.lastVisited || next.title !== previous.title) updated += 1;
        indexed.set(incoming.url, next);
      }
      const merged = sortVisits([...indexed.values()]);
      await this.write(profileId, merged);
      return { persisted: true, added, updated, invalid, total: merged.length };
    });
  }

  replace(profileId: string, entries: unknown): Promise<BrowserHistoryReplaceResult> {
    if (!Array.isArray(entries)) return Promise.reject(new Error('History entries must be an array.'));
    return this.exclusive(profileId, async () => {
      // A corrupt existing store must not be silently erased by hydration.
      await this.read(profileId);
      const indexed = new Map<string, BrowserVisit>();
      for (const value of entries) {
        const entry = normalizeEntry(value, profileId);
        if (!entry) throw new Error('Invalid history snapshot. Existing data was preserved.');
        const previous = indexed.get(entry.url);
        indexed.set(entry.url, previous ? { ...entry, count: Math.max(previous.count, entry.count), lastVisited: Math.max(previous.lastVisited, entry.lastVisited) } : entry);
      }
      const next = sortVisits([...indexed.values()]);
      await this.write(profileId, next);
      return { persisted: true, total: next.length };
    });
  }
}
