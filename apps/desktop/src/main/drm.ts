import path from 'node:path';
import fs from 'node:fs';

export interface WidevineCdmInfo {
  cdmPath: string;
  version: string;
  source: 'edge' | 'chrome' | 'component' | 'custom';
}

export interface DrmFs {
  existsSync(p: string): boolean;
  readdirSync(p: string): string[];
  readFileSync(p: string, encoding: 'utf8'): string;
}

export interface CommandLineLike {
  appendSwitch(switchName: string, value?: string): void;
}

export interface AppLike {
  commandLine: CommandLineLike;
}

/**
 * Compare version strings numerically in descending order (highest version first).
 * e.g. "153.0.4234.48" > "120.0.0.0" > "90.0.0.0"
 */
export function compareVersionsDesc(a: string, b: string): number {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const na = pa[i] ?? 0;
    const nb = pb[i] ?? 0;
    if (na !== nb) return nb - na;
  }
  return 0;
}

/**
 * Get platform-specific subdirectory for Widevine CDM on Windows.
 */
export function getWidevinePlatformSubdir(arch: string = process.arch): string {
  switch (arch) {
    case 'arm64':
      return 'win_arm64';
    case 'ia32':
      return 'win_x86';
    case 'x64':
    default:
      return 'win_x64';
  }
}

interface SearchCandidate {
  baseDir: string;
  source: 'edge' | 'chrome' | 'component';
  isComponentDir?: boolean;
}

/**
 * Inspect a candidate directory containing WidevineCdm components.
 */
function inspectWidevineDirectory(
  widevineDir: string,
  source: 'edge' | 'chrome' | 'component',
  fileSystem: DrmFs,
  arch: string
): WidevineCdmInfo | null {
  const manifestPath = path.join(widevineDir, 'manifest.json');
  if (!fileSystem.existsSync(manifestPath)) {
    return null;
  }

  let version = '';
  try {
    const raw = fileSystem.readFileSync(manifestPath, 'utf8');
    const parsed = JSON.parse(raw) as { version?: string };
    if (typeof parsed.version === 'string' && parsed.version.length > 0) {
      version = parsed.version;
    }
  } catch {
    return null;
  }

  if (!version) {
    return null;
  }

  const platformSubdir = getWidevinePlatformSubdir(arch);
  const binaryFileName = process.platform === 'win32' || process.env.TEST_PLATFORM === 'win32'
    ? 'widevinecdm.dll'
    : process.platform === 'darwin'
      ? 'libwidevinecdm.dylib'
      : 'libwidevinecdm.so';

  // 1. Check _platform_specific/<platform>/<binary>
  const specificPath = path.join(widevineDir, '_platform_specific', platformSubdir, binaryFileName);
  if (fileSystem.existsSync(specificPath)) {
    return { cdmPath: specificPath, version, source };
  }

  // 2. Check direct binary in widevineDir
  const directPath = path.join(widevineDir, binaryFileName);
  if (fileSystem.existsSync(directPath)) {
    return { cdmPath: directPath, version, source };
  }

  return null;
}

/**
 * Discover system Widevine CDM from Microsoft Edge or Google Chrome.
 * Follows Ansatz 3: utilizes existing OS-licensed binaries without bundling copyright-protected files.
 */
export function findSystemWidevine(
  customFs?: DrmFs,
  customEnv?: NodeJS.ProcessEnv,
  customPlatform?: string,
  customArch?: string
): WidevineCdmInfo | null {
  const targetPlatform = customPlatform ?? process.platform;
  const targetArch = customArch ?? process.arch;
  const env = customEnv ?? process.env;
  const fileSystem: DrmFs = customFs ?? {
    existsSync: fs.existsSync,
    readdirSync: fs.readdirSync,
    readFileSync: fs.readFileSync
  };

  // Widevine system auto-detection currently targets Windows installations
  if (targetPlatform !== 'win32' && env.TEST_PLATFORM !== 'win32') {
    return null;
  }

  const progFilesX86 = env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
  const progFiles = env.ProgramFiles || 'C:\\Program Files';
  const localAppData = env.LOCALAPPDATA || '';

  const candidates: SearchCandidate[] = [
    // 1. Microsoft Edge (Primary source on Windows 10/11)
    { baseDir: path.join(progFilesX86, 'Microsoft', 'Edge', 'Application'), source: 'edge' },
    { baseDir: path.join(progFiles, 'Microsoft', 'Edge', 'Application'), source: 'edge' },
    ...(localAppData ? [{ baseDir: path.join(localAppData, 'Microsoft', 'Edge', 'Application'), source: 'edge' as const }] : []),

    // 2. Google Chrome (Secondary source if Edge Widevine is missing or Chrome is preferred)
    { baseDir: path.join(progFiles, 'Google', 'Chrome', 'Application'), source: 'chrome' },
    { baseDir: path.join(progFilesX86, 'Google', 'Chrome', 'Application'), source: 'chrome' },
    ...(localAppData ? [{ baseDir: path.join(localAppData, 'Google', 'Chrome', 'Application'), source: 'chrome' as const }] : []),

    // 3. User Data Component folders
    ...(localAppData ? [
      { baseDir: path.join(localAppData, 'Google', 'Chrome', 'User Data', 'WidevineCdm'), source: 'component' as const, isComponentDir: true },
      { baseDir: path.join(localAppData, 'Microsoft', 'Edge', 'User Data', 'WidevineCdm'), source: 'component' as const, isComponentDir: true }
    ] : [])
  ];

  const allFound: WidevineCdmInfo[] = [];

  for (const candidate of candidates) {
    if (!fileSystem.existsSync(candidate.baseDir)) {
      continue;
    }

    try {
      const entries = fileSystem.readdirSync(candidate.baseDir);
      // Sort version folders descending to prefer the freshest Widevine CDM
      const versionDirs = entries
        .filter((entry) => /^\d+(\.\d+)*$/.test(entry))
        .sort(compareVersionsDesc);

      for (const verDir of versionDirs) {
        const fullDir = path.join(candidate.baseDir, verDir);
        const widevineTarget = candidate.isComponentDir
          ? fullDir
          : path.join(fullDir, 'WidevineCdm');

        if (fileSystem.existsSync(widevineTarget)) {
          const info = inspectWidevineDirectory(widevineTarget, candidate.source, fileSystem, targetArch);
          if (info) {
            allFound.push(info);
            break;
          }
        }
      }
    } catch {
      // Unreadable directory or permissions failure, proceed to next candidate
      continue;
    }
  }

  if (allFound.length > 0) {
    allFound.sort((a, b) => compareVersionsDesc(a.version, b.version));
    return allFound[0];
  }

  return null;
}

/**
 * Detect whether Castlabs Electron with native components support is active.
 */
export function isCastlabsElectron(electronModule?: unknown): boolean {
  try {
    const mod = electronModule || require('electron');
    return Boolean(mod && typeof (mod as { components?: unknown }).components === 'object');
  } catch {
    return false;
  }
}

/**
 * Initialize Widevine CDM via Castlabs Electron components API.
 * Must be called in or after app.whenReady().
 */
export async function initializeCastlabsWidevine(electronModule?: unknown): Promise<boolean> {
  try {
    const mod = electronModule || (await import('electron'));
    const components = (mod as unknown as { components?: { whenReady?: () => Promise<void>; status?: () => unknown } }).components;
    if (components && typeof components.whenReady === 'function') {
      await components.whenReady();
      const status = typeof components.status === 'function' ? components.status() : 'ready';
      console.log('[DRM/Widevine] Castlabs Widevine CDM components ready:', status);
      return true;
    }
  } catch (err) {
    console.warn('[DRM/Widevine] Failed to initialize Castlabs Widevine components:', err);
  }
  return false;
}

/**
 * Configure Chromium command-line switches with system Widevine CDM before app is ready.
 * Must be called before app.whenReady().
 */
export function configureDrmWidevine(
  appInstance: AppLike,
  customInfo?: WidevineCdmInfo | null,
  customFs?: DrmFs,
  customEnv?: NodeJS.ProcessEnv,
  electronModule?: unknown
): boolean {
  try {
    // If Castlabs Electron is running, it uses the native component updater
    // instead of legacy command-line switches (which could conflict).
    if (customInfo === undefined && isCastlabsElectron(electronModule)) {
      console.log('[DRM/Widevine] Castlabs Electron detected — using native Component Updater (components.whenReady).');
      return true;
    }

    const info = customInfo !== undefined ? customInfo : findSystemWidevine(customFs, customEnv);
    if (!info) {
      console.log('[DRM/Widevine] No system Widevine CDM found on host.');
      return false;
    }

    appInstance.commandLine.appendSwitch('widevine-cdm-path', info.cdmPath);
    appInstance.commandLine.appendSwitch('widevine-cdm-version', info.version);
    console.log(`[DRM/Widevine] Registered system Widevine CDM v${info.version} (${info.source}) from ${info.cdmPath}`);
    return true;
  } catch (err) {
    console.error('[DRM/Widevine] Failed to configure Widevine switches:', err);
    return false;
  }
}
