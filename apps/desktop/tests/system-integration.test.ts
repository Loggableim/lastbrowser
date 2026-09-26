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

  it('extracts URL when provided as a single standalone argument', () => {
    expect(extractUrlFromArgs(['https://lastbrowser.com'])).toBe('https://lastbrowser.com');
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

describe('Clear Browsing Data (Microsoft Store Policy 10.2)', () => {
  it('exposes clearData in preload bridge', () => {
    const preloadPath = path.resolve(__dirname, '../src/main/preload.ts');
    const content = readFileSync(preloadPath, 'utf8');
    expect(content).toContain('clearData');
    expect(content).toContain('lastbrowser:browser:clearData');
  });

  it('declares clearData in global.d.ts', () => {
    const dtsPath = path.resolve(__dirname, '../src/renderer/global.d.ts');
    const content = readFileSync(dtsPath, 'utf8');
    expect(content).toContain('clearData?:');
    expect(content).toContain('Promise<{ ok: boolean }>;');
  });

  it('implements lastbrowser:browser:clearData in main.ts with cache and storage cleanup', () => {
    const mainPath = path.resolve(__dirname, '../src/main/main.ts');
    const content = readFileSync(mainPath, 'utf8');
    expect(content).toContain("ipcMain.handle('lastbrowser:browser:clearData'");
    expect(content).toContain('sess.clearCache()');
    expect(content).toContain('sess.clearStorageData(');
  });
});

describe('Split tab detach transfer handshake', () => {
  it('waits for the destination renderer to acknowledge before removing the source tab', () => {
    const main = readFileSync(path.resolve(__dirname, '../src/main/main.ts'), 'utf8');
    const app = readFileSync(path.resolve(__dirname, '../src/renderer/App.tsx'), 'utf8');
    const preload = readFileSync(path.resolve(__dirname, '../src/main/preload.ts'), 'utf8');

    expect(main).toContain("ipcMain.handle('lastbrowser:window:getStartupState'");
    expect(main).toContain("ipcMain.handle('lastbrowser:window:ackDetachedTab'");
    expect(main).toContain('transfer.payload.tab?.id !== tabId');
    expect(main).toContain('if (!await acknowledged)');
    expect(preload).toContain('getStartupState:');
    expect(preload).toContain('ackDetachedTab:');

    const detach = app.indexOf('const handleDetachTab = useCallback');
    const startup = app.indexOf('const initializeWindow = async');
    expect(detach).toBeGreaterThan(-1);
    expect(startup).toBeGreaterThan(-1);
    expect(app.slice(detach, startup)).toContain('if (result?.success) useTabStore.getState().detachTab(tabToDetach.id)');
    expect(app.slice(startup, startup + 1700)).toContain('setPendingDetachedTransfer');
    expect(app).toContain('onDomReady={(event) => {');
    expect(app).toContain('onTransferredWebviewReady(tab.id)');
    expect(app).toContain('webview.getWebContentsId()');
    expect(app).toContain("webview.addEventListener('dom-ready', confirmAttached, { once: true })");
    expect(main).toContain('detachedWindow.destroy()');
    expect(app).toContain('webviewReady && webviewStartupReady');
    expect(app).toContain('ackDetachedTab?.(transfer.transferId, tabId)');
    expect(app.slice(startup, startup + 5000)).toContain('startupInitialized = true');
    expect(app.slice(startup, startup + 5000)).toContain('!cancelled && startupInitialized');
    expect(app).toContain('if (windowStartupInitializedRef.current) return undefined;');
    expect(app).toContain('windowStartupInitializedRef.current = true;');
    expect(app).toContain('if (isDetachedWindow || !windowStartupReady) return;');
  });
});

describe('Microsoft Store Generative AI Policy – Response Reporting & Feedback', () => {
  it('saves feedback entry with reason, snippet, timestamp and uuid', async () => {
    const { saveAiFeedback, AI_FEEDBACK_STORAGE_KEY } = await import('../src/renderer/components/AiFeedbackModal.js');
    const mockStore: Record<string, string> = {};
    const mockStorage = {
      getItem: (k: string) => mockStore[k] || null,
      setItem: (k: string, v: string) => { mockStore[k] = v; },
      removeItem: (k: string) => { delete mockStore[k]; }
    };
    (globalThis as any).localStorage = mockStorage;
    if (typeof window !== 'undefined') (window as any).localStorage = mockStorage;

    const entry = saveAiFeedback({
      reason: 'inaccurate',
      comments: 'Falsche Jahreszahl angegeben',
      messageSnippet: 'Hier ist eine Zusammenfassung...'
    });

    expect(entry.id).toBeDefined();
    expect(entry.reason).toBe('inaccurate');
    expect(entry.comments).toBe('Falsche Jahreszahl angegeben');
    expect(entry.timestamp).toBeGreaterThan(0);

    const saved = JSON.parse(mockStore[AI_FEEDBACK_STORAGE_KEY]);
    expect(Array.isArray(saved)).toBe(true);
    expect(saved[0].id).toBe(entry.id);
  });
});
