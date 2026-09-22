/**
 * Tests for Microsoft Store & Win32 Release Readiness (Phase 1)
 *
 * Covers:
 *  - extractUrlFromArgs (Single-Instance URL routing & Cold Start)
 *  - package.json protocols & file associations for default browser registration
 *  - installer.nsh silent-uninstall non-blocking guard
 */

import { describe, it, expect, vi } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

// Minimal electron mock
vi.mock('electron', () => ({
  app: {
    getPath: () => '/tmp',
    getName: () => 'Lastbrowser',
    setName: vi.fn(),
    requestSingleInstanceLock: vi.fn(() => true),
    isDefaultProtocolClient: vi.fn(() => true),
    setAsDefaultProtocolClient: vi.fn(() => true),
    commandLine: { appendSwitch: vi.fn() },
    whenReady: () => Promise.resolve(),
    on: vi.fn()
  },
  BrowserWindow: vi.fn(),
  ipcMain: { handle: vi.fn(), on: vi.fn() },
  session: { defaultSession: {} },
  Menu: { buildFromTemplate: vi.fn(), setApplicationMenu: vi.fn() },
  clipboard: { writeText: vi.fn() },
  shell: { openExternal: vi.fn() }
}));

// Import extractUrlFromArgs from modular url-dispatch
import { extractUrlFromArgs } from '../src/main/url-dispatch.js';

describe('Single-Instance URL Dispatcher (extractUrlFromArgs)', () => {
  it('returns null when no arguments are provided or only executable path', () => {
    expect(extractUrlFromArgs([])).toBeNull();
    expect(extractUrlFromArgs(['C:\\Program Files\\Lastbrowser\\Lastbrowser.exe'])).toBeNull();
  });

  it('ignores standard command-line flags and debugging switches', () => {
    const args = [
      'Lastbrowser.exe',
      '--remote-debugging-port=9222',
      '--updated',
      '--no-sandbox',
      '-v'
    ];
    expect(extractUrlFromArgs(args)).toBeNull();
  });

  it('ignores node/electron entrypoint script filenames', () => {
    const args = [
      'electron.exe',
      'dist/main/main.js',
      '--enable-logging'
    ];
    expect(extractUrlFromArgs(args)).toBeNull();
  });

  it('ignores unexpanded Windows shell template tokens (%1, %L)', () => {
    const args = ['Lastbrowser.exe', '%1'];
    expect(extractUrlFromArgs(args)).toBeNull();
    const argsL = ['Lastbrowser.exe', '%L'];
    expect(extractUrlFromArgs(argsL)).toBeNull();
  });

  it('extracts https web URLs passed from external applications', () => {
    const args = ['Lastbrowser.exe', 'https://github.com/Loggableim/lastbrowser'];
    expect(extractUrlFromArgs(args)).toBe('https://github.com/Loggableim/lastbrowser');
  });

  it('extracts http web URLs passed from external applications', () => {
    const args = ['Lastbrowser.exe', 'http://localhost:3000/dashboard'];
    expect(extractUrlFromArgs(args)).toBe('http://localhost:3000/dashboard');
  });

  it('extracts file URLs', () => {
    const args = ['Lastbrowser.exe', 'file:///C:/Users/test/report.html'];
    expect(extractUrlFromArgs(args)).toBe('file:///C:/Users/test/report.html');
  });

  it('converts relative or absolute .html file arguments to file:// URLs', () => {
    const args = ['Lastbrowser.exe', 'README.html'];
    const extracted = extractUrlFromArgs(args);
    expect(extracted).not.toBeNull();
    expect(extracted?.startsWith('file:///')).toBe(true);
    expect(extracted?.endsWith('README.html')).toBe(true);
  });
});

describe('Microsoft Store & Windows Default Browser Configuration (package.json)', () => {
  const pkgPath = path.resolve(__dirname, '../package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));

  it('registers http and https protocols in electron-builder config', () => {
    expect(pkg.build?.protocols).toBeDefined();
    const protocols = pkg.build.protocols;
    const schemes = protocols.flatMap((p: { schemes: string[] }) => p.schemes);
    expect(schemes).toContain('http');
    expect(schemes).toContain('https');
  });

  it('registers html and htm file associations for default browser detection', () => {
    expect(pkg.build?.fileAssociations).toBeDefined();
    const exts = pkg.build.fileAssociations.map((f: { ext: string }) => f.ext);
    expect(exts).toContain('html');
    expect(exts).toContain('htm');
  });
});

describe('Silent-Uninstall Certification Guard (installer.nsh)', () => {
  const nshPath = path.resolve(__dirname, '../build/installer.nsh');

  it('exists in the build directory', () => {
    expect(existsSync(nshPath)).toBe(true);
  });

  it('guards user data prompt with ${ifNot} ${Silent} to prevent hanging on /S', () => {
    const content = readFileSync(nshPath, 'utf8');
    expect(content).toContain('${ifNot} ${Silent}');
    expect(content).toContain('customUnInstall');
  });
});
