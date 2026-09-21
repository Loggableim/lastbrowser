import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync, cpSync } from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { dialog, type BrowserWindow, type Session } from 'electron';

export type ExtensionSource = 'store' | 'unpacked' | 'preset';

export type ExtensionRecord = {
  id: string;
  name: string;
  version: string;
  description: string;
  iconDataUrl?: string;
  path: string;
  enabled: boolean;
  manifestVersion: number;
  source: ExtensionSource;
  installTime: number;
  allowInIncognito: boolean;
  permissions?: string[];
  homepageUrl?: string;
};

export type ExtensionPreset = {
  id: string;
  name: string;
  cwsId: string;
  category: string;
  description: string;
  author: string;
  badge?: string;
  icon: string;
  homepageUrl?: string;
};

export const EXTENSION_PRESETS: ExtensionPreset[] = [
  {
    id: 'darkreader',
    name: 'Dark Reader',
    cwsId: 'eimadpbcbfnmbkopoojfekhnkhdbieeh',
    category: 'Theme & Eyes',
    description: 'Inverts colors with high contrast dark themes for all websites.',
    author: 'Alexander Shutau',
    badge: 'Dark Mode',
    icon: '🌙',
    homepageUrl: 'https://darkreader.org'
  },
  {
    id: 'ublock-origin-lite',
    name: 'uBlock Origin Lite',
    cwsId: 'ddkjiahejlhfcafbddmgiahcphecmpfh',
    category: 'Privacy & Ads',
    description: 'Permission-less DeclarativeNetRequest Manifest V3 content and ad blocker.',
    author: 'Raymond Hill',
    badge: 'Manifest V3',
    icon: '🛡️',
    homepageUrl: 'https://github.com/gorhill/uBlock'
  },
  {
    id: 'bitwarden',
    name: 'Bitwarden Password Manager',
    cwsId: 'nngceckbapebfimnlniiiahkandclblb',
    category: 'Security',
    description: 'Secure open-source password vault and auto-fill credential manager.',
    author: 'Bitwarden Inc.',
    badge: 'Open Source',
    icon: '🔑',
    homepageUrl: 'https://bitwarden.com'
  },
  {
    id: 'clearurls',
    name: 'ClearURLs',
    cwsId: 'lckanjmonadidipfcdaflepgkpmopjkj',
    category: 'Privacy',
    description: 'Automatically strips tracking, telemetry and referral parameters from URLs.',
    author: 'Kevin Roebert',
    badge: 'Anti-Tracking',
    icon: '🔗',
    homepageUrl: 'https://clearurls.rb2.pw'
  },
  {
    id: 'violentmonkey',
    name: 'Violentmonkey',
    cwsId: 'jinjaccalgkegednnccohejagnlnfdag',
    category: 'Developer Tools',
    description: 'Open-source userscript manager supporting Greasemonkey and Tampermonkey scripts.',
    author: 'violentmonkey.github.io',
    badge: 'User Scripts',
    icon: '🐒',
    homepageUrl: 'https://violentmonkey.github.io'
  }
];

/**
 * Extracts a 32-character Chrome Web Store ID from a raw ID or full Web Store URL.
 */
export function extractCwsId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  // Raw 32-character lowercase alpha ID (e.g. eimadpbcbfnmbkopoojfekhnkhdbieeh)
  if (/^[a-p]{32}$/i.test(trimmed)) {
    return trimmed.toLowerCase();
  }
  // URL matching: chromewebstore.google.com/detail/.../<id> or chrome.google.com/webstore/detail/.../<id>
  const urlMatch = trimmed.match(/(?:chromewebstore\.google\.com|chrome\.google\.com\/webstore)\/detail\/(?:[^/]+\/)?([a-p]{32})/i);
  if (urlMatch && urlMatch[1]) {
    return urlMatch[1].toLowerCase();
  }
  // Generic /<id> with 32 characters at the end of path or query
  const queryMatch = trimmed.match(/[?&]id=([a-p]{32})/i) || trimmed.match(/\/([a-p]{32})(?:[/?#]|$)/i);
  if (queryMatch && queryMatch[1]) {
    return queryMatch[1].toLowerCase();
  }
  return null;
}

/**
 * Unpacks a CRX3 / CRX2 or standard ZIP buffer into a target directory.
 * Built with zero external dependencies using Node.js built-in `node:zlib` and `node:fs`.
 */
export function extractCrxOrZipBuffer(buffer: Buffer, outputDir: string): void {
  mkdirSync(outputDir, { recursive: true });

  let zipBuffer: Buffer = buffer;

  // Check CRX Magic ('Cr24' = 0x34327243)
  if (buffer.length >= 16 && buffer.toString('utf8', 0, 4) === 'Cr24') {
    const version = buffer.readUInt32LE(4);
    if (version === 3) {
      // CRX3: header size at offset 8, ZIP begins at 12 + headerSize
      const headerSize = buffer.readUInt32LE(8);
      const zipOffset = 12 + headerSize;
      if (zipOffset >= buffer.length) {
        throw new Error(`Corrupt CRX3 package: header size ${headerSize} exceeds buffer length ${buffer.length}`);
      }
      zipBuffer = buffer.subarray(zipOffset);
    } else if (version === 2) {
      // CRX2: pubKeyLength at 8, sigLength at 12, ZIP starts at 16 + pubKeyLength + sigLength
      const pubKeyLen = buffer.readUInt32LE(8);
      const sigLen = buffer.readUInt32LE(12);
      const zipOffset = 16 + pubKeyLen + sigLen;
      if (zipOffset >= buffer.length) {
        throw new Error(`Corrupt CRX2 package: offset ${zipOffset} exceeds buffer length ${buffer.length}`);
      }
      zipBuffer = buffer.subarray(zipOffset);
    } else {
      throw new Error(`Unsupported CRX format version: ${version}`);
    }
  }

  // Parse ZIP using End of Central Directory Record (EOCD)
  extractZipArchive(zipBuffer, outputDir);
}

/**
 * Parses standard ZIP archive structures and writes extracted files to destination.
 */
function extractZipArchive(buffer: Buffer, targetDir: string): void {
  // Find End of Central Directory (EOCD) signature: 0x06054b50 ('PK\x05\x06')
  let eocdOffset = -1;
  for (let i = buffer.length - 22; i >= 0 && i >= buffer.length - 65536 - 22; i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }

  if (eocdOffset === -1) {
    // Fallback: Try sequential local header parsing if EOCD is missing
    extractZipSequentially(buffer, targetDir);
    return;
  }

  const cdTotalEntries = buffer.readUInt16LE(eocdOffset + 10);
  const cdOffset = buffer.readUInt32LE(eocdOffset + 16);

  let currentCdOffset = cdOffset;
  for (let entryIdx = 0; entryIdx < cdTotalEntries; entryIdx++) {
    if (currentCdOffset + 46 > buffer.length) break;
    const cdSignature = buffer.readUInt32LE(currentCdOffset);
    if (cdSignature !== 0x02014b50) break; // 'PK\x01\x02'

    const method = buffer.readUInt16LE(currentCdOffset + 10);
    const compressedSize = buffer.readUInt32LE(currentCdOffset + 20);
    const nameLen = buffer.readUInt16LE(currentCdOffset + 28);
    const extraLen = buffer.readUInt16LE(currentCdOffset + 30);
    const commentLen = buffer.readUInt16LE(currentCdOffset + 32);
    const localHeaderOffset = buffer.readUInt32LE(currentCdOffset + 42);

    const fileNameRaw = buffer.toString('utf8', currentCdOffset + 46, currentCdOffset + 46 + nameLen);
    currentCdOffset += 46 + nameLen + extraLen + commentLen;

    // Security: sanitize path against directory traversal
    const safeRelPath = path.normalize(fileNameRaw.replace(/\\/g, '/')).replace(/^(\.\.(\/|\\|$))+/, '');
    if (!safeRelPath || safeRelPath === '.' || safeRelPath.startsWith('..')) continue;

    const destPath = path.join(targetDir, safeRelPath);

    if (fileNameRaw.endsWith('/') || fileNameRaw.endsWith('\\')) {
      mkdirSync(destPath, { recursive: true });
      continue;
    }

    // Read from local file header
    if (localHeaderOffset + 30 > buffer.length) continue;
    const localSig = buffer.readUInt32LE(localHeaderOffset);
    if (localSig !== 0x04034b50) continue; // 'PK\x03\x04'

    const localNameLen = buffer.readUInt16LE(localHeaderOffset + 26);
    const localExtraLen = buffer.readUInt16LE(localHeaderOffset + 28);
    const dataStart = localHeaderOffset + 30 + localNameLen + localExtraLen;
    const dataEnd = dataStart + compressedSize;

    if (dataEnd > buffer.length) continue;
    const compressedData = buffer.subarray(dataStart, dataEnd);

    let uncompressedData: Buffer;
    if (method === 0) {
      uncompressedData = compressedData;
    } else if (method === 8) {
      uncompressedData = zlib.inflateRawSync(compressedData);
    } else {
      continue; // Skip unsupported compression method
    }

    mkdirSync(path.dirname(destPath), { recursive: true });
    writeFileSync(destPath, uncompressedData);
  }
}

/**
 * Fallback sequential local file header extractor.
 */
function extractZipSequentially(buffer: Buffer, targetDir: string): void {
  let offset = 0;
  while (offset + 30 <= buffer.length) {
    const sig = buffer.readUInt32LE(offset);
    if (sig !== 0x04034b50) break; // Stop when not a local file header

    const method = buffer.readUInt16LE(offset + 8);
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const nameLen = buffer.readUInt16LE(offset + 26);
    const extraLen = buffer.readUInt16LE(offset + 28);

    const fileNameRaw = buffer.toString('utf8', offset + 30, offset + 30 + nameLen);
    const dataStart = offset + 30 + nameLen + extraLen;
    const dataEnd = dataStart + compressedSize;

    if (dataEnd > buffer.length) break;

    const safeRelPath = path.normalize(fileNameRaw.replace(/\\/g, '/')).replace(/^(\.\.(\/|\\|$))+/, '');
    if (safeRelPath && !safeRelPath.startsWith('..')) {
      const destPath = path.join(targetDir, safeRelPath);
      if (fileNameRaw.endsWith('/') || fileNameRaw.endsWith('\\')) {
        mkdirSync(destPath, { recursive: true });
      } else {
        const compressedData = buffer.subarray(dataStart, dataEnd);
        let uncompressedData: Buffer | null = null;
        if (method === 0) {
          uncompressedData = compressedData;
        } else if (method === 8) {
          try {
            uncompressedData = zlib.inflateRawSync(compressedData);
          } catch {
            uncompressedData = null;
          }
        }
        if (uncompressedData) {
          mkdirSync(path.dirname(destPath), { recursive: true });
          writeFileSync(destPath, uncompressedData);
        }
      }
    }

    offset = dataEnd;
  }
}

/**
 * Inspects an unpacked extension folder to parse metadata from manifest.json.
 */
export function inspectExtensionDirectory(dirPath: string): {
  idCandidate: string;
  name: string;
  version: string;
  description: string;
  manifestVersion: number;
  permissions: string[];
  iconDataUrl?: string;
  homepageUrl?: string;
} {
  const manifestPath = path.join(dirPath, 'manifest.json');
  if (!existsSync(manifestPath)) {
    throw new Error(`No manifest.json found at ${dirPath}`);
  }

  let manifest: Record<string, unknown>;
  try {
    const raw = readFileSync(manifestPath, 'utf8');
    manifest = JSON.parse(raw) as Record<string, unknown>;
  } catch (err) {
    throw new Error(`Failed to parse manifest.json: ${err instanceof Error ? err.message : String(err)}`);
  }

  const manifestVersion = typeof manifest.manifest_version === 'number' ? manifest.manifest_version : 3;
  let name = typeof manifest.name === 'string' ? manifest.name : 'Unnamed Extension';
  let description = typeof manifest.description === 'string' ? manifest.description : '';
  const version = typeof manifest.version === 'string' ? manifest.version : '1.0.0';
  const homepageUrl = typeof manifest.homepage_url === 'string' ? manifest.homepage_url : undefined;
  const permissions = Array.isArray(manifest.permissions) ? (manifest.permissions as string[]) : [];

  // Check for localized placeholders like __MSG_appName__
  if (name.startsWith('__MSG_') && name.endsWith('__')) {
    const key = name.slice(6, -2);
    const localized = resolveLocaleMessage(dirPath, key);
    if (localized) name = localized;
    else name = path.basename(dirPath);
  }

  if (description.startsWith('__MSG_') && description.endsWith('__')) {
    const key = description.slice(6, -2);
    const localized = resolveLocaleMessage(dirPath, key);
    if (localized) description = localized;
    else description = '';
  }

  // Find icon data URL
  let iconDataUrl: string | undefined;
  if (manifest.icons && typeof manifest.icons === 'object') {
    const icons = manifest.icons as Record<string, string>;
    const iconKey = ['128', '64', '48', '32', '16'].find((k) => typeof icons[k] === 'string');
    if (iconKey && icons[iconKey]) {
      const iconPath = path.join(dirPath, icons[iconKey]);
      if (existsSync(iconPath)) {
        try {
          const iconBytes = readFileSync(iconPath);
          const ext = path.extname(iconPath).toLowerCase().replace('.', '') || 'png';
          iconDataUrl = `data:image/${ext === 'svg' ? 'svg+xml' : ext};base64,${iconBytes.toString('base64')}`;
        } catch {
          // Ignore icon read error
        }
      }
    }
  }

  const idCandidate = path.basename(dirPath).toLowerCase().replace(/[^a-z0-9_-]/g, '_');

  return {
    idCandidate,
    name,
    version,
    description,
    manifestVersion,
    permissions,
    iconDataUrl,
    homepageUrl
  };
}

function resolveLocaleMessage(dirPath: string, key: string): string | null {
  const locales = ['en', 'en_US', 'de', 'de_DE'];
  for (const loc of locales) {
    const msgPath = path.join(dirPath, '_locales', loc, 'messages.json');
    if (existsSync(msgPath)) {
      try {
        const msgs = JSON.parse(readFileSync(msgPath, 'utf8')) as Record<string, { message?: string }>;
        if (msgs[key]?.message) return msgs[key].message!;
        // Case insensitive lookup
        const lowerKey = key.toLowerCase();
        for (const [k, v] of Object.entries(msgs)) {
          if (k.toLowerCase() === lowerKey && v.message) return v.message;
        }
      } catch {
        // Continue to next locale
      }
    }
  }
  return null;
}

export class ExtensionManager {
  private baseDir: string;
  private registryFile: string;
  private records: Map<string, ExtensionRecord> = new Map();
  private getActiveSessions: () => Session[];

  constructor(userDataDir: string, getActiveSessions: () => Session[]) {
    this.baseDir = path.join(userDataDir, 'extensions');
    this.registryFile = path.join(this.baseDir, 'extensions.json');
    this.getActiveSessions = getActiveSessions;
  }

  public async init(): Promise<void> {
    mkdirSync(this.baseDir, { recursive: true });
    this.loadRegistry();

    // Attach all enabled extensions to current active sessions
    const sessions = this.getActiveSessions();
    for (const session of sessions) {
      await this.attachToSession(session);
    }
  }

  public list(): ExtensionRecord[] {
    return Array.from(this.records.values());
  }

  public getPresets(): ExtensionPreset[] {
    return EXTENSION_PRESETS;
  }

  public get(id: string): ExtensionRecord | undefined {
    return this.records.get(id);
  }

  public async attachToSession(session: Session, isIncognito = false): Promise<void> {
    for (const record of this.records.values()) {
      if (!record.enabled) continue;
      if (isIncognito && !record.allowInIncognito) continue;
      if (!existsSync(record.path)) continue;

      try {
        // session.loadExtension loads the extension into Chromium's webview engine
        if (typeof session.loadExtension === 'function') {
          await session.loadExtension(record.path, { allowFileAccess: true });
        }
      } catch (error) {
        console.warn(`[extensions] Failed to load extension ${record.name} (${record.id}):`, error);
      }
    }
  }

  public async installFromDirectory(sourceDir: string): Promise<ExtensionRecord> {
    if (!existsSync(sourceDir)) {
      throw new Error(`Directory does not exist: ${sourceDir}`);
    }

    const meta = inspectExtensionDirectory(sourceDir);
    const extId = meta.idCandidate || `ext_${Date.now()}`;
    const destDir = path.join(this.baseDir, extId);

    // Copy to persistent extensions storage
    if (existsSync(destDir)) {
      rmSync(destDir, { recursive: true, force: true });
    }
    mkdirSync(destDir, { recursive: true });
    cpSync(sourceDir, destDir, { recursive: true });

    const record: ExtensionRecord = {
      id: extId,
      name: meta.name,
      version: meta.version,
      description: meta.description,
      iconDataUrl: meta.iconDataUrl,
      path: destDir,
      enabled: true,
      manifestVersion: meta.manifestVersion,
      source: 'unpacked',
      installTime: Date.now(),
      allowInIncognito: false,
      permissions: meta.permissions,
      homepageUrl: meta.homepageUrl
    };

    this.records.set(extId, record);
    this.saveRegistry();

    // Load into active sessions
    await this.loadRecordIntoSessions(record);
    return record;
  }

  public async installFromCws(extensionIdOrUrl: string): Promise<ExtensionRecord> {
    const cwsId = extractCwsId(extensionIdOrUrl);
    if (!cwsId) {
      throw new Error(`Invalid Chrome Web Store ID or URL: "${extensionIdOrUrl}". Expected a 32-character ID or store URL.`);
    }

    // Google's official CRX update endpoint for Chrome Web Store
    const crxUrl = `https://clients2.google.com/service/update2/crx?response=redirect&prodversion=132.0.0.0&acceptformat=crx2,crx3&x=id%3D${encodeURIComponent(cwsId)}%26uc`;

    const response = await fetch(crxUrl);
    if (!response.ok) {
      throw new Error(`Failed to download extension from Chrome Web Store (HTTP ${response.status})`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const crxBuffer = Buffer.from(arrayBuffer);

    const destDir = path.join(this.baseDir, cwsId);
    if (existsSync(destDir)) {
      rmSync(destDir, { recursive: true, force: true });
    }
    mkdirSync(destDir, { recursive: true });

    extractCrxOrZipBuffer(crxBuffer, destDir);

    const meta = inspectExtensionDirectory(destDir);
    const preset = EXTENSION_PRESETS.find((p) => p.cwsId === cwsId);

    const record: ExtensionRecord = {
      id: cwsId,
      name: meta.name || preset?.name || cwsId,
      version: meta.version,
      description: meta.description || preset?.description || '',
      iconDataUrl: meta.iconDataUrl,
      path: destDir,
      enabled: true,
      manifestVersion: meta.manifestVersion,
      source: preset ? 'preset' : 'store',
      installTime: Date.now(),
      allowInIncognito: false,
      permissions: meta.permissions,
      homepageUrl: meta.homepageUrl || preset?.homepageUrl
    };

    this.records.set(cwsId, record);
    this.saveRegistry();

    // Load into active sessions
    await this.loadRecordIntoSessions(record);
    return record;
  }

  public async toggle(extensionId: string, enabled: boolean): Promise<ExtensionRecord> {
    const record = this.records.get(extensionId);
    if (!record) {
      throw new Error(`Extension ${extensionId} not found`);
    }

    record.enabled = enabled;
    this.records.set(extensionId, record);
    this.saveRegistry();

    if (enabled) {
      await this.loadRecordIntoSessions(record);
    } else {
      await this.unloadRecordFromSessions(extensionId);
    }

    return record;
  }

  public async toggleIncognito(extensionId: string, allow: boolean): Promise<ExtensionRecord> {
    const record = this.records.get(extensionId);
    if (!record) {
      throw new Error(`Extension ${extensionId} not found`);
    }

    record.allowInIncognito = allow;
    this.records.set(extensionId, record);
    this.saveRegistry();
    return record;
  }

  public async remove(extensionId: string): Promise<boolean> {
    const record = this.records.get(extensionId);
    if (!record) return false;

    // Unload from sessions
    await this.unloadRecordFromSessions(extensionId);

    // Delete folder
    if (existsSync(record.path)) {
      try {
        rmSync(record.path, { recursive: true, force: true });
      } catch (err) {
        console.warn(`[extensions] Could not delete directory ${record.path}:`, err);
      }
    }

    this.records.delete(extensionId);
    this.saveRegistry();
    return true;
  }

  public async chooseDirectory(parentWindow?: BrowserWindow): Promise<string | null> {
    const result = await dialog.showOpenDialog(parentWindow ?? (null as unknown as BrowserWindow), {
      title: 'Select Unpacked Extension Folder',
      properties: ['openDirectory']
    });

    if (result.canceled || !result.filePaths.length) {
      return null;
    }
    return result.filePaths[0];
  }

  private async loadRecordIntoSessions(record: ExtensionRecord): Promise<void> {
    const sessions = this.getActiveSessions();
    for (const session of sessions) {
      try {
        if (typeof session.loadExtension === 'function') {
          await session.loadExtension(record.path, { allowFileAccess: true });
        }
      } catch (err) {
        console.warn(`[extensions] Could not load ${record.id} in session:`, err);
      }
    }
  }

  private async unloadRecordFromSessions(extensionId: string): Promise<void> {
    const sessions = this.getActiveSessions();
    for (const session of sessions) {
      try {
        if (typeof session.removeExtension === 'function') {
          session.removeExtension(extensionId);
        }
      } catch (err) {
        console.warn(`[extensions] Could not remove ${extensionId} from session:`, err);
      }
    }
  }

  private loadRegistry(): void {
    if (!existsSync(this.registryFile)) {
      return;
    }
    try {
      const raw = readFileSync(this.registryFile, 'utf8');
      const list = JSON.parse(raw) as ExtensionRecord[];
      if (Array.isArray(list)) {
        for (const item of list) {
          if (item && item.id && item.path) {
            this.records.set(item.id, item);
          }
        }
      }
    } catch (err) {
      console.warn('[extensions] Failed to load registry:', err);
    }
  }

  private saveRegistry(): void {
    try {
      const list = Array.from(this.records.values());
      writeFileSync(this.registryFile, JSON.stringify(list, null, 2), 'utf8');
    } catch (err) {
      console.warn('[extensions] Failed to save registry:', err);
    }
  }
}
