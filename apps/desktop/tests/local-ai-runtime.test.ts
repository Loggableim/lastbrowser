import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { installRuntime, loadRuntimeLock, runtimeBackends } from '../src/main/local-ai-runtime.js';

const folders: string[] = [];
afterEach(() => { for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true }); });

function hash(bytes: Buffer) { return createHash('sha256').update(bytes).digest('hex'); }

function storedZip(entries: Record<string, Buffer>): Buffer {
  const locals: Buffer[] = []; const centrals: Buffer[] = []; let offset = 0;
  for (const [name, data] of Object.entries(entries)) {
    const nameBytes = Buffer.from(name, 'utf8');
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0, 6); local.writeUInt16LE(0, 8);
    local.writeUInt32LE(0, 10); local.writeUInt32LE(0, 14); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26); local.writeUInt16LE(0, 28);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10); central.writeUInt16LE(0, 12); central.writeUInt32LE(0, 14); central.writeUInt32LE(0, 18);
    central.writeUInt32LE(data.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt16LE(0, 30); central.writeUInt16LE(0, 32); central.writeUInt16LE(0, 34); central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38); central.writeUInt32LE(offset, 42);
    locals.push(local, nameBytes, data); centrals.push(central, nameBytes);
    offset += local.length + nameBytes.length + data.length;
  }
  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(0, 4); end.writeUInt16LE(0, 6);
  end.writeUInt16LE(Object.keys(entries).length, 8); end.writeUInt16LE(Object.keys(entries).length, 10);
  end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16); end.writeUInt16LE(0, 20);
  return Buffer.concat([...locals, directory, end]);
}

function fixture(options: { extraFile?: string; corruptFileHash?: boolean } = {}) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'lastbrowser-runtime-')); folders.push(root);
  const executable = Buffer.from('MZ fixture llama-server');
  const license = Buffer.from('license fixture');
  const files = [
    { path: 'llama-server.exe', sha256: hash(executable) },
    { path: 'LICENSE', sha256: hash(license) }
  ];
  if (options.extraFile) files.push({ path: options.extraFile, sha256: hash(Buffer.from('missing')) });
  if (options.corruptFileHash) files[0] = { path: files[0].path, sha256: hash(Buffer.from('other')) };
  const archive = storedZip({ 'llama-server.exe': executable, LICENSE: license });
  const lock = {
    version: 'fixture', platform: 'win32', arch: 'x64',
    assets: [{
      backend: 'cpu', archive: 'fixture.zip',
      url: 'https://github.com/ggml-org/llama.cpp/releases/download/fixture/fixture.zip',
      bytes: archive.length, sha256: hash(archive), files
    }]
  };
  writeFileSync(path.join(root, 'runtime-lock.json'), JSON.stringify(lock));
  return { root, archive, executable, license, lock };
}

function writeLock(root: string, lock: unknown) {
  writeFileSync(path.join(root, 'runtime-lock.json'), JSON.stringify(lock));
}

describe('on-demand local AI runtime', () => {
  it('installs only pinned files after verifying archive and file hashes', async () => {
    const f = fixture();
    const progress: number[] = [];
    await installRuntime({ runtimeRoot: f.root, backend: 'cpu', platform: 'win32', arch: 'x64',
      fetcher: (async () => new Response(f.archive)) as typeof fetch,
      onProgress: (completed) => progress.push(completed) });
    expect(runtimeBackends(f.root)).toEqual(['cpu']);
    expect(readFileSync(path.join(f.root, 'cpu', 'llama-server.exe'))).toEqual(f.executable);
    expect(readFileSync(path.join(f.root, 'cpu', 'LICENSE'))).toEqual(f.license);
    expect(progress.at(-1)).toBe(f.archive.length);
    expect(existsSync(path.join(f.root, '.downloads', 'fixture.zip'))).toBe(false);
    expect(existsSync(path.join(f.root, '.downloads', 'fixture.zip.partial'))).toBe(false);
  });

  it('rejects a wrong archive hash and leaves no executable behind', async () => {
    const f = fixture();
    writeLock(f.root, { ...f.lock, assets: [{ ...f.lock.assets[0], sha256: '0'.repeat(64) }] });
    await expect(installRuntime({ runtimeRoot: f.root, backend: 'cpu', platform: 'win32', arch: 'x64',
      fetcher: (async () => new Response(f.archive)) as typeof fetch })).rejects.toThrow('Prüfsumme der Runtime');
    expect(runtimeBackends(f.root)).toEqual([]);
    expect(existsSync(path.join(f.root, '.downloads', 'fixture.zip.partial'))).toBe(false);
  });

  it('rejects a download whose byte size does not match the manifest', async () => {
    const f = fixture();
    writeLock(f.root, { ...f.lock, assets: [{ ...f.lock.assets[0], bytes: f.archive.length + 1 }] });
    await expect(installRuntime({ runtimeRoot: f.root, backend: 'cpu', platform: 'win32', arch: 'x64',
      fetcher: (async () => new Response(f.archive)) as typeof fetch })).rejects.toThrow('Prüfsumme der Runtime');
    expect(runtimeBackends(f.root)).toEqual([]);
  });

  it('rejects an archive that lacks a pinned file', async () => {
    const f = fixture({ extraFile: 'missing.dll' });
    await expect(installRuntime({ runtimeRoot: f.root, backend: 'cpu', platform: 'win32', arch: 'x64',
      fetcher: (async () => new Response(f.archive)) as typeof fetch })).rejects.toThrow('unvollständig');
    expect(runtimeBackends(f.root)).toEqual([]);
  });

  it('rejects a pinned file whose hash does not match', async () => {
    const f = fixture({ corruptFileHash: true });
    await expect(installRuntime({ runtimeRoot: f.root, backend: 'cpu', platform: 'win32', arch: 'x64',
      fetcher: (async () => new Response(f.archive)) as typeof fetch })).rejects.toThrow('Prüfsumme der Runtime-Datei');
    expect(runtimeBackends(f.root)).toEqual([]);
  });

  it('refuses untrusted URLs, unsafe paths, malformed hashes, and foreign platforms', async () => {
    const f = fixture();
    writeLock(f.root, { ...f.lock, assets: [{ ...f.lock.assets[0], url: 'https://example.com/fixture.zip' }] });
    expect(() => loadRuntimeLock(f.root)).toThrow('Quelle');
    writeLock(f.root, { ...f.lock, assets: [{ ...f.lock.assets[0], files: [{ path: '../escape.dll', sha256: hash(Buffer.from('x')) }] }] });
    expect(() => loadRuntimeLock(f.root)).toThrow('Dateipfad');
    writeLock(f.root, { ...f.lock, assets: [{ ...f.lock.assets[0], sha256: 'not-a-hash' }] });
    expect(() => loadRuntimeLock(f.root)).toThrow('Ungültiger Runtime-Katalog');
    writeLock(f.root, f.lock);
    await expect(installRuntime({ runtimeRoot: f.root, backend: 'cpu', platform: 'linux', arch: 'x64',
      fetcher: vi.fn() as unknown as typeof fetch })).rejects.toThrow('win32/x64');
  });

  it('does not download when the backend is already installed', async () => {
    const f = fixture();
    mkdirSync(path.join(f.root, 'cpu'));
    writeFileSync(path.join(f.root, 'cpu', 'llama-server.exe'), 'installed');
    const fetcher = vi.fn();
    await installRuntime({ runtimeRoot: f.root, backend: 'cpu', platform: 'win32', arch: 'x64', fetcher: fetcher as unknown as typeof fetch });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
