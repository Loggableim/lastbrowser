import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { LocalAiManager, verifyModelFile } from '../src/main/local-ai.js';
import { assessModel } from '../src/main/local-ai-hardware.js';
import type { HardwareReport, LocalModel } from '../src/main/local-ai-contract.js';

vi.mock('../src/main/local-ai-hardware.js', async (original) => ({
  ...await original<typeof import('../src/main/local-ai-hardware.js')>(),
  scanLocalHardware: async () => hardware
}));
const hardware: HardwareReport = { platform: 'win32', arch: 'x64', cpu: 'fixture', cores: 4, ramBytes: 16 * 1024 ** 3, availableRamBytes: 8 * 1024 ** 3, freeDiskBytes: 8 * 1024 ** 3, gpus: [], warnings: [] };
const folders: string[] = [];
afterEach(() => { for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true }); });
function fixture(fetcher: typeof fetch) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'lastbrowser-local-')); folders.push(root);
  const bytes = Buffer.from('GGUF fixture bytes');
  const model: LocalModel = { id: 'test', name: 'test', repository: 'test/model', revision: 'fixed', filename: 'test.gguf', bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), url: 'https://huggingface.co/test/model/resolve/fixed/test.gguf', license: 'apache-2.0', evaluation: 'candidate', contextTokens: 8192, estimatedRamBytes: 1024 ** 3 };
  writeFileSync(path.join(root, 'models.json'), JSON.stringify([model]));
  const manager = new LocalAiManager(root, root, fetcher);
  return { root, bytes, model, manager };
}

describe('local AI verified model storage', () => {
  it('resumes immutable bytes and checks the whole file before installation', async () => {
    let f: ReturnType<typeof fixture>;
    const fetcher = vi.fn(async (_url, options) => {
      expect(options.headers.Range).toBe('bytes=5-');
      return new Response(f.bytes.subarray(5), { status: 206, headers: { 'content-range': `bytes 5-${f.bytes.length - 1}/${f.bytes.length}` } });
    });
    f = fixture(fetcher as unknown as typeof fetch);
    writeFileSync(path.join(f.root, 'test.gguf.partial'), f.bytes.subarray(0, 5));
    await f.manager.download('test');
    expect(f.manager.status().installed).toEqual(['test']);
    expect(readFileSync(path.join(f.root, 'test.gguf'))).toEqual(f.bytes);
  });
  it('discards mismatched model bytes without marking the model installed', async () => {
    const f = fixture((async () => new Response('wrong')) as typeof fetch);
    await f.manager.download('test');
    expect(f.manager.status().phase).toBe('error');
    expect(f.manager.status().installed).toEqual([]);
    expect(existsSync(path.join(f.root, 'test.gguf.partial'))).toBe(false);
  });
  it('restarts from zero when the server ignores a range request', async () => {
    let f: ReturnType<typeof fixture>;
    f = fixture((async () => new Response(f.bytes)) as typeof fetch);
    writeFileSync(path.join(f.root, 'test.gguf.partial'), f.bytes.subarray(0, 3));
    await f.manager.download('test');
    expect(await verifyModelFile(path.join(f.root, 'test.gguf'), f.model)).toBe(true);
  });
  it('copies and validates imports; rejects wrong size before copying', async () => {
    const f = fixture(vi.fn());
    const source = path.join(f.root, 'source.gguf'); writeFileSync(source, 'wrong');
    await expect(f.manager.importFile('test', source)).rejects.toThrow('Dateigröße');
    writeFileSync(source, f.bytes); await f.manager.importFile('test', source);
    expect(f.manager.status().installed).toEqual(['test']);
    expect(readFileSync(source)).toEqual(f.bytes);
  });
  it('rejects arbitrary models and untested Space configuration', async () => {
    const f = fixture(vi.fn());
    await expect(f.manager.download('../arbitrary')).rejects.toThrow('Unbekanntes');
    expect(() => f.manager.configure('space-a', 'test', true)).toThrow('testen');
    expect(f.manager.status('space-b').scope).toBeNull();
  });
  it('cancels a download without installing unverified partial bytes', async () => {
    const f = fixture((async (_url, options) => new Promise((_resolve, reject) => options!.signal!.addEventListener('abort', () => reject(new Error('aborted'))))) as typeof fetch);
    const work = f.manager.download('test');
    await vi.waitFor(() => expect(f.manager.status().phase).toBe('downloading'));
    f.manager.cancel(); await work;
    expect(f.manager.status().phase).toBe('idle');
    expect(f.manager.status().installed).toEqual([]);
  });
  it('refuses unknown disk capacity and leaves GPU VRAM unknown rather than guessing', () => {
    const f = fixture(vi.fn());
    expect(assessModel(f.model, { ...hardware, freeDiskBytes: null }).usable).toBe(false);
    expect(assessModel(f.model, { ...hardware, availableRamBytes: 1 }).usable).toBe(false);
    expect(assessModel(f.model, hardware).usable).toBe(true);
  });
});
