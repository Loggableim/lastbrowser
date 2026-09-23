import { describe, expect, it, vi } from 'vitest';
import path from 'node:path';
import {
  compareVersionsDesc,
  getWidevinePlatformSubdir,
  findSystemWidevine,
  configureDrmWidevine,
  type DrmFs,
  type AppLike,
  type WidevineCdmInfo
} from '../src/main/drm.js';

describe('DRM Widevine module', () => {
  describe('compareVersionsDesc', () => {
    it('sorts versions numerically in descending order', () => {
      const versions = ['90.0.450.0', '153.0.4234.48', '120.0.100.2', '153.0.4200.10'];
      const sorted = [...versions].sort(compareVersionsDesc);
      expect(sorted).toEqual([
        '153.0.4234.48',
        '153.0.4200.10',
        '120.0.100.2',
        '90.0.450.0'
      ]);
    });

    it('handles equal versions', () => {
      expect(compareVersionsDesc('1.0.0', '1.0.0')).toBe(0);
    });

    it('handles malformed numbers gracefully', () => {
      expect(compareVersionsDesc('invalid', '1.0.0')).toBeGreaterThan(0);
      expect(compareVersionsDesc('1.0.0', 'invalid')).toBeLessThan(0);
    });
  });

  describe('getWidevinePlatformSubdir', () => {
    it('maps architectures to platform subdirectories', () => {
      expect(getWidevinePlatformSubdir('x64')).toBe('win_x64');
      expect(getWidevinePlatformSubdir('arm64')).toBe('win_arm64');
      expect(getWidevinePlatformSubdir('ia32')).toBe('win_x86');
      expect(getWidevinePlatformSubdir('unknown')).toBe('win_x64');
    });
  });

  describe('findSystemWidevine with mock filesystem', () => {
    it('returns null on non-windows platform', () => {
      const result = findSystemWidevine(
        { existsSync: () => true, readdirSync: () => [], readFileSync: () => '' },
        {},
        'darwin'
      );
      expect(result).toBeNull();
    });

    it('detects Edge Widevine from mock Program Files directory', () => {
      const edgeBase = path.normalize('C:/Program Files (x86)/Microsoft/Edge/Application');
      const versionDir = '153.0.4234.48';
      const widevineDir = path.join(edgeBase, versionDir, 'WidevineCdm');
      const manifestPath = path.join(widevineDir, 'manifest.json');
      const dllPath = path.join(widevineDir, '_platform_specific', 'win_x64', 'widevinecdm.dll');

      const mockFs: DrmFs = {
        existsSync: vi.fn((p: string) => {
          const norm = path.normalize(p);
          return (
            norm === edgeBase ||
            norm === widevineDir ||
            norm === manifestPath ||
            norm === dllPath
          );
        }),
        readdirSync: vi.fn((p: string) => {
          if (path.normalize(p) === edgeBase) {
            return ['153.0.4234.48', '140.0.100.0', 'msedge.exe'];
          }
          return [];
        }),
        readFileSync: vi.fn((p: string) => {
          if (path.normalize(p) === manifestPath) {
            return JSON.stringify({ version: '4.10.3050.1' });
          }
          return '';
        })
      };

      const result = findSystemWidevine(
        mockFs,
        {
          'ProgramFiles(x86)': 'C:\\Program Files (x86)',
          ProgramFiles: 'C:\\Program Files',
          LOCALAPPDATA: 'C:\\Users\\Test\\AppData\\Local',
          TEST_PLATFORM: 'win32'
        },
        'win32',
        'x64'
      );

      expect(result).not.toBeNull();
      expect(result?.source).toBe('edge');
      expect(result?.version).toBe('4.10.3050.1');
      expect(result?.cdmPath).toBe(dllPath);
    });

    it('detects Chrome Widevine when Edge is not installed', () => {
      const chromeBase = path.normalize('C:/Program Files/Google/Chrome/Application');
      const versionDir = '153.0.8010.53';
      const widevineDir = path.join(chromeBase, versionDir, 'WidevineCdm');
      const manifestPath = path.join(widevineDir, 'manifest.json');
      const dllPath = path.join(widevineDir, '_platform_specific', 'win_x64', 'widevinecdm.dll');

      const mockFs: DrmFs = {
        existsSync: vi.fn((p: string) => {
          const norm = path.normalize(p);
          return (
            norm === chromeBase ||
            norm === widevineDir ||
            norm === manifestPath ||
            norm === dllPath
          );
        }),
        readdirSync: vi.fn((p: string) => {
          if (path.normalize(p) === chromeBase) {
            return [versionDir];
          }
          return [];
        }),
        readFileSync: vi.fn((p: string) => {
          if (path.normalize(p) === manifestPath) {
            return JSON.stringify({ version: '4.10.3050.0' });
          }
          return '';
        })
      };

      const result = findSystemWidevine(
        mockFs,
        {
          'ProgramFiles(x86)': 'C:\\Program Files (x86)',
          ProgramFiles: 'C:\\Program Files',
          LOCALAPPDATA: 'C:\\Users\\Test\\AppData\\Local',
          TEST_PLATFORM: 'win32'
        },
        'win32',
        'x64'
      );

      expect(result).not.toBeNull();
      expect(result?.source).toBe('chrome');
      expect(result?.version).toBe('4.10.3050.0');
    });

    it('supports direct dll location without platform subdirectory', () => {
      const edgeBase = path.normalize('C:/Program Files (x86)/Microsoft/Edge/Application');
      const versionDir = '120.0.0.0';
      const widevineDir = path.join(edgeBase, versionDir, 'WidevineCdm');
      const manifestPath = path.join(widevineDir, 'manifest.json');
      const directDllPath = path.join(widevineDir, 'widevinecdm.dll');

      const mockFs: DrmFs = {
        existsSync: vi.fn((p: string) => {
          const norm = path.normalize(p);
          return (
            norm === edgeBase ||
            norm === widevineDir ||
            norm === manifestPath ||
            norm === directDllPath
          );
        }),
        readdirSync: vi.fn(() => [versionDir]),
        readFileSync: vi.fn(() => JSON.stringify({ version: '4.10.2500.0' }))
      };

      const result = findSystemWidevine(
        mockFs,
        { 'ProgramFiles(x86)': 'C:\\Program Files (x86)', TEST_PLATFORM: 'win32' },
        'win32',
        'x64'
      );

      expect(result).not.toBeNull();
      expect(result?.cdmPath).toBe(directDllPath);
      expect(result?.version).toBe('4.10.2500.0');
    });

    it('returns null gracefully when manifest is invalid or missing', () => {
      const mockFs: DrmFs = {
        existsSync: vi.fn(() => false),
        readdirSync: vi.fn(() => []),
        readFileSync: vi.fn(() => '')
      };

      const result = findSystemWidevine(mockFs, { TEST_PLATFORM: 'win32' }, 'win32', 'x64');
      expect(result).toBeNull();
    });
  });

  describe('configureDrmWidevine', () => {
    it('appends widevine switches to app command line', () => {
      const switches: Record<string, string | undefined> = {};
      const mockApp: AppLike = {
        commandLine: {
          appendSwitch: vi.fn((k: string, v?: string) => {
            switches[k] = v;
          })
        }
      };

      const cdmInfo: WidevineCdmInfo = {
        cdmPath: 'C:\\Widevine\\widevinecdm.dll',
        version: '4.10.3050.1',
        source: 'edge'
      };

      const configured = configureDrmWidevine(mockApp, cdmInfo);
      expect(configured).toBe(true);
      expect(switches['widevine-cdm-path']).toBe('C:\\Widevine\\widevinecdm.dll');
      expect(switches['widevine-cdm-version']).toBe('4.10.3050.1');
    });

    it('returns false and skips switches when no cdm is found', () => {
      const mockApp: AppLike = {
        commandLine: {
          appendSwitch: vi.fn()
        }
      };

      const configured = configureDrmWidevine(mockApp, null);
      expect(configured).toBe(false);
      expect(mockApp.commandLine.appendSwitch).not.toHaveBeenCalled();
    });
  });

  describe('Host environment discovery (real filesystem)', () => {
    it('discovers Widevine on host if running on Windows with Edge/Chrome', () => {
      if (process.platform === 'win32') {
        const discovered = findSystemWidevine();
        if (discovered) {
          expect(discovered.cdmPath).toBeTruthy();
          expect(discovered.version).toMatch(/^\d+(\.\d+)+$/);
          expect(['edge', 'chrome', 'component']).toContain(discovered.source);
        }
      }
    });
  });
});
