import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import zlib from 'node:zlib';
import {
  ExtensionManager,
  extractCwsId,
  extractCrxOrZipBuffer,
  inspectExtensionDirectory,
  EXTENSION_PRESETS
} from '../src/main/extensions.js';

/**
 * Creates a valid in-memory ZIP buffer with given files (stored / no compression).
 */
function createTestZip(files: Record<string, string>): Buffer {
  const localHeaders: Buffer[] = [];
  const cdHeaders: Buffer[] = [];
  let currentOffset = 0;

  for (const [filename, contentStr] of Object.entries(files)) {
    const nameBuf = Buffer.from(filename, 'utf8');
    const dataBuf = Buffer.from(contentStr, 'utf8');

    // Local Header
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); // PK\x03\x04
    lh.writeUInt16LE(20, 4); // version
    lh.writeUInt16LE(0, 6); // flags
    lh.writeUInt16LE(0, 8); // method = stored
    lh.writeUInt16LE(0, 10); // time
    lh.writeUInt16LE(0, 12); // date
    lh.writeUInt32LE(0, 14); // crc32
    lh.writeUInt32LE(dataBuf.length, 18); // comp size
    lh.writeUInt32LE(dataBuf.length, 22); // uncomp size
    lh.writeUInt16LE(nameBuf.length, 26);
    lh.writeUInt16LE(0, 28); // extra len

    localHeaders.push(lh, nameBuf, dataBuf);

    // Central Directory Header
    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0); // PK\x01\x02
    cd.writeUInt16LE(20, 4);
    cd.writeUInt16LE(20, 6);
    cd.writeUInt16LE(0, 8);
    cd.writeUInt16LE(0, 10); // method = stored
    cd.writeUInt16LE(0, 12);
    cd.writeUInt16LE(0, 14);
    cd.writeUInt32LE(0, 16);
    cd.writeUInt32LE(dataBuf.length, 20);
    cd.writeUInt32LE(dataBuf.length, 24);
    cd.writeUInt16LE(nameBuf.length, 28);
    cd.writeUInt16LE(0, 30);
    cd.writeUInt16LE(0, 32);
    cd.writeUInt16LE(0, 34);
    cd.writeUInt16LE(0, 36);
    cd.writeUInt32LE(0, 38);
    cd.writeUInt32LE(currentOffset, 42); // local header offset

    cdHeaders.push(cd, nameBuf);

    currentOffset += 30 + nameBuf.length + dataBuf.length;
  }

  const cdOffset = currentOffset;
  const cdData = Buffer.concat(cdHeaders);
  const cdSize = cdData.length;

  // EOCD
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); // PK\x05\x06
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(Object.keys(files).length, 8);
  eocd.writeUInt16LE(Object.keys(files).length, 10);
  eocd.writeUInt32LE(cdSize, 12);
  eocd.writeUInt32LE(cdOffset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localHeaders, cdData, eocd]);
}

/**
 * Wraps a ZIP buffer in a simulated CRX3 container.
 */
function createTestCrx3(zipBuffer: Buffer): Buffer {
  const dummyProtobufHeader = Buffer.from('dummy_header_bytes', 'utf8');
  const header = Buffer.alloc(12);
  header.write('Cr24', 0, 4, 'utf8'); // Magic
  header.writeUInt32LE(3, 4); // Version 3
  header.writeUInt32LE(dummyProtobufHeader.length, 8); // Header length

  return Buffer.concat([header, dummyProtobufHeader, zipBuffer]);
}

describe('extensions engine', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = path.join(os.tmpdir(), `lastbrowser-ext-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('extractCwsId', () => {
    it('extracts standard 32-character CWS IDs', () => {
      expect(extractCwsId('eimadpbcbfnmbkopoojfekhnkhdbieeh')).toBe('eimadpbcbfnmbkopoojfekhnkhdbieeh');
      expect(extractCwsId('EIMADPBCBFNMBKOPOOJFEKHNKHDBIEEH')).toBe('eimadpbcbfnmbkopoojfekhnkhdbieeh');
    });

    it('extracts ID from modern chromewebstore URLs', () => {
      const url = 'https://chromewebstore.google.com/detail/dark-reader/eimadpbcbfnmbkopoojfekhnkhdbieeh';
      expect(extractCwsId(url)).toBe('eimadpbcbfnmbkopoojfekhnkhdbieeh');
    });

    it('extracts ID from legacy chrome.google.com/webstore URLs', () => {
      const url = 'https://chrome.google.com/webstore/detail/ublock-origin-lite/ddkjiahejlhfcafbddmgiahcphecmpfh';
      expect(extractCwsId(url)).toBe('ddkjiahejlhfcafbddmgiahcphecmpfh');
    });

    it('extracts ID from query parameter', () => {
      expect(extractCwsId('https://clients2.google.com/service/update2/crx?id=nngceckbapebfimnlniiiahkandclblb')).toBe('nngceckbapebfimnlniiiahkandclblb');
    });

    it('returns null for invalid inputs', () => {
      expect(extractCwsId('')).toBeNull();
      expect(extractCwsId('invalid-short-id')).toBeNull();
      expect(extractCwsId('12345678901234567890123456789012')).toBeNull(); // Numbers outside [a-p]
    });
  });

  describe('extractCrxOrZipBuffer', () => {
    it('extracts a standard ZIP buffer', () => {
      const zip = createTestZip({
        'manifest.json': JSON.stringify({ name: 'Test Ext', version: '1.0.0', manifest_version: 3 }),
        'rules.json': JSON.stringify([{ id: 1, action: { type: 'block' } }])
      });

      const outDir = path.join(tempDir, 'extracted-zip');
      extractCrxOrZipBuffer(zip, outDir);

      expect(existsSync(path.join(outDir, 'manifest.json'))).toBe(true);
      expect(existsSync(path.join(outDir, 'rules.json'))).toBe(true);

      const parsedManifest = JSON.parse(readFileSync(path.join(outDir, 'manifest.json'), 'utf8'));
      expect(parsedManifest.name).toBe('Test Ext');
    });

    it('extracts a CRX3 package with Cr24 header', () => {
      const zip = createTestZip({
        'manifest.json': JSON.stringify({ name: 'CRX3 Addon', version: '2.0.0', manifest_version: 3 }),
        'background.js': 'console.log("Service Worker Active");'
      });
      const crx3 = createTestCrx3(zip);

      const outDir = path.join(tempDir, 'extracted-crx3');
      extractCrxOrZipBuffer(crx3, outDir);

      expect(existsSync(path.join(outDir, 'manifest.json'))).toBe(true);
      expect(existsSync(path.join(outDir, 'background.js'))).toBe(true);

      const content = readFileSync(path.join(outDir, 'background.js'), 'utf8');
      expect(content).toBe('console.log("Service Worker Active");');
    });

    it('sanitizes directory traversal paths', () => {
      const zip = createTestZip({
        'manifest.json': '{"name":"Safe"}',
        '../../evil.txt': 'malicious'
      });

      const outDir = path.join(tempDir, 'extracted-safe');
      extractCrxOrZipBuffer(zip, outDir);

      // evil.txt should not be written outside outDir
      expect(existsSync(path.join(tempDir, 'evil.txt'))).toBe(false);
      expect(existsSync(path.join(outDir, 'manifest.json'))).toBe(true);
    });
  });

  describe('inspectExtensionDirectory', () => {
    it('reads manifest properties correctly', () => {
      const extDir = path.join(tempDir, 'sample-ext');
      mkdirSync(extDir, { recursive: true });
      writeFileSync(
        path.join(extDir, 'manifest.json'),
        JSON.stringify({
          name: 'My Custom Extension',
          version: '1.2.3',
          description: 'A test extension',
          manifest_version: 3,
          permissions: ['declarativeNetRequest', 'storage']
        })
      );

      const meta = inspectExtensionDirectory(extDir);
      expect(meta.name).toBe('My Custom Extension');
      expect(meta.version).toBe('1.2.3');
      expect(meta.description).toBe('A test extension');
      expect(meta.manifestVersion).toBe(3);
      expect(meta.permissions).toEqual(['declarativeNetRequest', 'storage']);
    });

    it('resolves localized messages from _locales', () => {
      const extDir = path.join(tempDir, 'i18n-ext');
      const localesDir = path.join(extDir, '_locales', 'en');
      mkdirSync(localesDir, { recursive: true });

      writeFileSync(
        path.join(extDir, 'manifest.json'),
        JSON.stringify({
          name: '__MSG_appName__',
          description: '__MSG_appDesc__',
          version: '1.0.0',
          manifest_version: 3
        })
      );

      writeFileSync(
        path.join(localesDir, 'messages.json'),
        JSON.stringify({
          appName: { message: 'Localized Super Ext' },
          appDesc: { message: 'Localized description text' }
        })
      );

      const meta = inspectExtensionDirectory(extDir);
      expect(meta.name).toBe('Localized Super Ext');
      expect(meta.description).toBe('Localized description text');
    });
  });

  describe('ExtensionManager', () => {
    let fakeSession: any;
    let loadedExtensions: Map<string, string>;

    beforeEach(() => {
      loadedExtensions = new Map();
      fakeSession = {
        loadExtension: vi.fn(async (extPath: string) => {
          loadedExtensions.set(path.basename(extPath), extPath);
          return { id: path.basename(extPath), name: 'Fake Ext' };
        }),
        removeExtension: vi.fn((extId: string) => {
          loadedExtensions.delete(extId);
        }),
        getAllExtensions: vi.fn(() => Array.from(loadedExtensions.values()))
      };
    });

    it('provides curated presets with Dark Reader, uBlock Lite, Bitwarden', () => {
      const manager = new ExtensionManager(tempDir, () => [fakeSession]);
      const presets = manager.getPresets();
      expect(presets.length).toBeGreaterThanOrEqual(5);

      const ids = presets.map((p) => p.id);
      expect(ids).toContain('darkreader');
      expect(ids).toContain('ublock-origin-lite');
      expect(ids).toContain('bitwarden');
      expect(ids).toContain('clearurls');
      expect(ids).toContain('violentmonkey');
    });

    it('installs unpacked local extensions, loads into sessions and saves registry', async () => {
      const extDir = path.join(tempDir, 'my-unpacked');
      mkdirSync(extDir, { recursive: true });
      writeFileSync(
        path.join(extDir, 'manifest.json'),
        JSON.stringify({
          name: 'Awesome Unpacked Tool',
          version: '1.0.0',
          manifest_version: 3
        })
      );

      const manager = new ExtensionManager(tempDir, () => [fakeSession]);
      await manager.init();

      const record = await manager.installFromDirectory(extDir);
      expect(record.name).toBe('Awesome Unpacked Tool');
      expect(record.enabled).toBe(true);
      expect(record.source).toBe('unpacked');

      // Verify loaded into fake session
      expect(fakeSession.loadExtension).toHaveBeenCalled();

      // Verify saved in registry
      const registryFile = path.join(tempDir, 'extensions', 'extensions.json');
      expect(existsSync(registryFile)).toBe(true);
      const savedList = JSON.parse(readFileSync(registryFile, 'utf8'));
      expect(savedList.length).toBe(1);
      expect(savedList[0].name).toBe('Awesome Unpacked Tool');

      // List returns it
      expect(manager.list().length).toBe(1);
    });

    it('supports toggling enable/disable and toggling incognito', async () => {
      const extDir = path.join(tempDir, 'toggle-test');
      mkdirSync(extDir, { recursive: true });
      writeFileSync(
        path.join(extDir, 'manifest.json'),
        JSON.stringify({ name: 'Toggle Tool', version: '1.0.0', manifest_version: 3 })
      );

      const manager = new ExtensionManager(tempDir, () => [fakeSession]);
      await manager.init();

      const record = await manager.installFromDirectory(extDir);

      // Disable
      const disabled = await manager.toggle(record.id, false);
      expect(disabled.enabled).toBe(false);
      expect(fakeSession.removeExtension).toHaveBeenCalledWith(record.id);

      // Enable
      const enabled = await manager.toggle(record.id, true);
      expect(enabled.enabled).toBe(true);

      // Toggle incognito
      const incognitoAllowed = await manager.toggleIncognito(record.id, true);
      expect(incognitoAllowed.allowInIncognito).toBe(true);
    });

    it('removes extension from sessions, deletes files, and clears registry', async () => {
      const extDir = path.join(tempDir, 'remove-test');
      mkdirSync(extDir, { recursive: true });
      writeFileSync(
        path.join(extDir, 'manifest.json'),
        JSON.stringify({ name: 'Remove Me', version: '0.1.0', manifest_version: 3 })
      );

      const manager = new ExtensionManager(tempDir, () => [fakeSession]);
      await manager.init();

      const record = await manager.installFromDirectory(extDir);
      expect(manager.list().length).toBe(1);

      const removed = await manager.remove(record.id);
      expect(removed).toBe(true);
      expect(manager.list().length).toBe(0);
      expect(fakeSession.removeExtension).toHaveBeenCalledWith(record.id);
    });
  });
});
