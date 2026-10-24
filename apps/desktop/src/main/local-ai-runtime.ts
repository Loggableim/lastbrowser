import { createHash, randomUUID } from 'node:crypto';
import { createWriteStream, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { mkdir, readFile, rm, rename } from 'node:fs/promises';
import path from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { inflateRawSync } from 'node:zlib';

export type LocalAiBackend = 'cpu' | 'vulkan';
type RuntimeFile = { path: string; sha256: string };
export type RuntimeAsset = {
  backend: LocalAiBackend;
  archive: string;
  url: string;
  bytes: number;
  sha256: string;
  files: RuntimeFile[];
};
export type RuntimeLock = {
  version: string;
  platform: string;
  arch: string;
  assets: RuntimeAsset[];
};

const ALLOWED_URL_PREFIX = 'https://github.com/ggml-org/llama.cpp/releases/download/';
const SHA256 = /^[a-f0-9]{64}$/;

function assertSafeRelative(value: string): string {
  if (typeof value !== 'string' || !value || value.includes('\\') || value.includes(':')
    || value.startsWith('/') || value.split('/').some((part) => !part || part === '.' || part === '..')) {
    throw new Error('Ungültiger Dateipfad im Runtime-Katalog.');
  }
  return value;
}

/**
 * Reads the pinned engine catalog that ships with the installer. It contains
 * only immutable archive URLs, sizes, hashes and the exact extracted files.
 */
export function loadRuntimeLock(runtimeRoot: string): RuntimeLock {
  const file = path.join(runtimeRoot, 'runtime-lock.json');
  if (!existsSync(file)) throw new Error('Runtime-Katalog fehlt.');
  const lock = JSON.parse(readFileSync(file, 'utf8')) as RuntimeLock;
  if (!lock || typeof lock.version !== 'string' || !lock.version.trim() || typeof lock.platform !== 'string' || typeof lock.arch !== 'string'
    || !Array.isArray(lock.assets) || !lock.assets.length) throw new Error('Ungültiger Runtime-Katalog.');
  for (const asset of lock.assets) {
    if (asset.backend !== 'cpu' && asset.backend !== 'vulkan') throw new Error('Ungültiger Runtime-Katalog.');
    if (path.basename(asset.archive) !== asset.archive || !/^[a-zA-Z0-9._-]+$/.test(asset.archive)) throw new Error('Ungültiger Runtime-Katalog.');
    if (typeof asset.url !== 'string' || !asset.url.startsWith(ALLOWED_URL_PREFIX)) throw new Error('Ungültige Runtime-Quelle.');
    if (!Number.isSafeInteger(asset.bytes) || asset.bytes <= 0 || !SHA256.test(asset.sha256)) throw new Error('Ungültiger Runtime-Katalog.');
    if (!Array.isArray(asset.files) || !asset.files.length) throw new Error('Ungültiger Runtime-Katalog.');
    const seen = new Set<string>();
    for (const entry of asset.files) {
      const relative = assertSafeRelative(entry.path);
      if (seen.has(relative) || !SHA256.test(entry.sha256)) throw new Error('Ungültiger Runtime-Katalog.');
      seen.add(relative);
    }
  }
  return lock;
}

export function runtimeBackends(runtimeRoot: string): LocalAiBackend[] {
  return (['cpu', 'vulkan'] as const).filter((backend) => existsSync(path.join(runtimeRoot, backend, 'llama-server.exe')));
}

function findEndOfCentralDirectory(archive: Buffer): number {
  const minimum = Math.max(0, archive.length - 0xffff - 22);
  for (let offset = archive.length - 22; offset >= minimum; offset--) {
    if (archive.readUInt32LE(offset) === 0x06054b50) return offset;
  }
  return -1;
}

/** Extracts only regular file entries. Deflate and stored entries are supported. */
function readArchive(archive: Buffer): Map<string, Buffer> {
  const end = findEndOfCentralDirectory(archive);
  if (end < 0) throw new Error('Runtime-Archiv ist kein gültiges ZIP.');
  const count = archive.readUInt16LE(end + 10);
  const centralOffset = archive.readUInt32LE(end + 16);
  if (centralOffset >= archive.length) throw new Error('Runtime-Archiv ist beschädigt.');
  const files = new Map<string, Buffer>();
  let cursor = centralOffset;
  for (let index = 0; index < count; index++) {
    if (cursor + 46 > archive.length || archive.readUInt32LE(cursor) !== 0x02014b50) throw new Error('Runtime-Archiv ist beschädigt.');
    const method = archive.readUInt16LE(cursor + 10);
    const compressedSize = archive.readUInt32LE(cursor + 20);
    const uncompressedSize = archive.readUInt32LE(cursor + 24);
    const nameLength = archive.readUInt16LE(cursor + 28);
    const extraLength = archive.readUInt16LE(cursor + 30);
    const commentLength = archive.readUInt16LE(cursor + 32);
    const localOffset = archive.readUInt32LE(cursor + 42);
    const name = archive.subarray(cursor + 46, cursor + 46 + nameLength).toString('utf8');
    if (localOffset + 30 > archive.length || archive.readUInt32LE(localOffset) !== 0x04034b50) throw new Error('Runtime-Archiv ist beschädigt.');
    const localNameLength = archive.readUInt16LE(localOffset + 26);
    const localExtraLength = archive.readUInt16LE(localOffset + 28);
    const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
    if (dataOffset + compressedSize > archive.length) throw new Error('Runtime-Archiv ist beschädigt.');
    if (!name.endsWith('/')) {
      const data = archive.subarray(dataOffset, dataOffset + compressedSize);
      const bytes = method === 0 ? Buffer.from(data) : method === 8 ? inflateRawSync(data) : null;
      if (!bytes || bytes.length !== uncompressedSize) throw new Error('Runtime-Archiv ist beschädigt.');
      const relative = assertSafeRelative(name.replaceAll('\\', '/'));
      if (files.has(relative)) throw new Error('Runtime-Archiv enthält doppelte Pfade.');
      files.set(relative, bytes);
    }
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return files;
}

export type InstallRuntimeOptions = {
  runtimeRoot: string;
  backend: LocalAiBackend;
  fetcher?: typeof fetch;
  platform?: NodeJS.Platform;
  arch?: string;
  signal?: AbortSignal;
  onProgress?: (completedBytes: number, totalBytes: number) => void;
};

/**
 * Downloads one pinned engine archive, verifies the archive and every
 * extracted file, then replaces the backend directory atomically.
 * No URL or file path from the renderer is accepted.
 */
export async function installRuntime({
  runtimeRoot,
  backend,
  fetcher = fetch,
  platform = process.platform,
  arch = process.arch,
  signal,
  onProgress
}: InstallRuntimeOptions): Promise<void> {
  const lock = loadRuntimeLock(runtimeRoot);
  if (platform !== lock.platform || arch !== lock.arch) {
    throw new Error(`Lokale Runtime ist nur für ${lock.platform}/${lock.arch} verfügbar.`);
  }
  const asset = lock.assets.find((item) => item.backend === backend);
  if (!asset) throw new Error('Lokale Runtime ist für diesen Rechenmodus nicht verfügbar.');
  const destination = path.join(runtimeRoot, backend);
  if (existsSync(path.join(destination, 'llama-server.exe'))) return;

  const downloads = path.join(runtimeRoot, '.downloads');
  await mkdir(downloads, { recursive: true });
  const archivePath = path.join(downloads, asset.archive);
  const partial = archivePath + '.partial';
  const stage = path.join(runtimeRoot, `.stage-${backend}-${randomUUID()}`);
  try {
    onProgress?.(0, asset.bytes);
    const response = await fetcher(asset.url, { signal });
    if (!response.ok || !response.body) throw new Error('Runtime-Download fehlgeschlagen. Bitte erneut versuchen.');
    let completed = 0;
    const meter = new Transform({
      transform(chunk, _encoding, callback) {
        completed += chunk.length;
        if (completed > asset.bytes) return callback(new Error('Runtime-Download überschreitet die erwartete Größe.'));
        onProgress?.(completed, asset.bytes);
        callback(null, chunk);
      }
    });
    await pipeline(Readable.fromWeb(response.body as never), meter, createWriteStream(partial, { mode: 0o600 }), { signal });
    signal?.throwIfAborted();
    const bytes = await readFile(partial);
    if (bytes.length !== asset.bytes || createHash('sha256').update(bytes).digest('hex') !== asset.sha256) {
      throw new Error('Prüfsumme der Runtime stimmt nicht. Archiv wurde verworfen.');
    }
    const entries = readArchive(bytes);
    await mkdir(stage, { recursive: true });
    for (const file of asset.files) {
      const relative = assertSafeRelative(file.path);
      const entry = entries.get(relative);
      if (!entry) throw new Error(`Runtime-Archiv unvollständig: ${relative}`);
      if (createHash('sha256').update(entry).digest('hex') !== file.sha256) throw new Error(`Prüfsumme der Runtime-Datei stimmt nicht: ${relative}`);
      const target = path.join(stage, ...relative.split('/'));
      await mkdir(path.dirname(target), { recursive: true });
      writeFileSync(target, entry, { mode: 0o755 });
    }
    signal?.throwIfAborted();
    await rm(destination, { recursive: true, force: true });
    await rename(stage, destination);
  } finally {
    await rm(stage, { recursive: true, force: true }).catch(() => undefined);
    await rm(partial, { force: true }).catch(() => undefined);
    await rm(archivePath, { force: true }).catch(() => undefined);
  }
}
