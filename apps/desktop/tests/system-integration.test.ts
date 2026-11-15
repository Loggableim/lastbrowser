/**
 * Tests for Microsoft Store & Win32 Release Readiness (Phase 1)
 *
 * Covers:
 *  - extractUrlFromArgs (Single-Instance URL routing & Cold Start)
 *  - package.json protocols & file associations for default browser registration
 *  - installer.nsh silent-uninstall non-blocking guard
 */

import { describe, it, expect, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
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

  it('wires macOS open-url and cold-start links through the queued window lifecycle', () => {
    const main = readFileSync(path.resolve(__dirname, '../src/main/main.ts'), 'utf8');
    expect(main).toContain("app.on('open-url', (event, url) => {");
    expect(main).toContain('openUrlLifecycle.handleOpenUrl(event, url)');
    expect(main).toContain('openUrlLifecycle.handleSecondInstance(commandLine)');
    expect(main).toContain('dispatchOpenUrl(initialUrl)');
    expect(main).toContain("window.webContents.on('did-finish-load', () => {");
    expect(main).toContain('openUrlLifecycle.onWindowReady(window)');
    expect(main).toContain('if (mainWindow === window) mainWindow = null');
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
    expect(content).toContain('failedSessions: number;');
    expect(content).toContain('error?: string;');
  });

  it('registers lastbrowser:browser:clearData with cache and storage cleanup', () => {
    const mainPath = path.resolve(__dirname, '../src/main/main.ts');
    const main = readFileSync(mainPath, 'utf8');
    const cleanupPath = path.resolve(__dirname, '../src/main/browser-data-cleanup.ts');
    const cleanup = readFileSync(cleanupPath, 'utf8');
    expect(main).toContain('registerBrowserDataCleanupIpc(ipcMain');
    expect(cleanup).toContain("const CHANNEL = 'lastbrowser:browser:clearData'");
    expect(cleanup).toContain('session.clearCache()');
    expect(cleanup).toContain('session.clearStorageData({ storages })');
    expect(cleanup).toContain('failedSessions');
  });

  it('exposes targeted deleted-profile cleanup through the preload and main process', () => {
    const preload = readFileSync(path.resolve(__dirname, '../src/main/preload.ts'), 'utf8');
    const types = readFileSync(path.resolve(__dirname, '../src/renderer/global.d.ts'), 'utf8');
    const main = readFileSync(path.resolve(__dirname, '../src/main/main.ts'), 'utf8');
    const app = readFileSync(path.resolve(__dirname, '../src/renderer/App.tsx'), 'utf8');
    expect(preload).toContain('clearDeletedProfileData');
    expect(types).toContain('clearDeletedProfileData?:');
    expect(main).toContain("ipcMain.handle('lastbrowser:browser:clearDeletedProfileData'");
    expect(main).toContain('session.fromPartition(partition)');
    expect(app).toContain('clearDeletedProfileData?.({ profileId, spacePaths: knownSpacePaths })');
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
    expect(app).toContain("element.addEventListener('dom-ready', onDomReady)");
    expect(app).toContain("element.addEventListener('did-fail-load', onDidFailLoad)");
    expect(app).toContain('webviewEventHandlersRef.current.onTransferredWebviewReady(tabId, element.getWebContentsId())');
    expect(app).toContain('webview.getWebContentsId()');
    expect(app).toContain("webview.addEventListener('dom-ready', confirmAttached)");
    expect(app).toContain("webview.removeEventListener('dom-ready', confirmAttached)");
    expect(main).toContain('detachedWindow.destroy()');
    expect(app).toContain('webviewReady && webviewStartupReady');
    expect(app).toContain('ackDetachedTab?.(transfer.transferId, tabId, guestWebContentsId)');
    expect(app).toContain('guestWebContentsId: number');
    expect(app).toContain('source webview is not ready');
    expect(app.slice(startup, startup + 5000)).toContain('startupInitialized = true');
    expect(app.slice(startup, startup + 5000)).toContain('!cancelled && startupInitialized');
    expect(app).toContain('if (windowStartupInitializedRef.current) return undefined;');
    expect(app).toContain('windowStartupInitializedRef.current = true;');
    expect(app).toContain('if (isDetachedWindow || !windowStartupReady) return;');
  });
});

describe('Microsoft Store Generative AI Policy – Response Reporting & Feedback', () => {
  it.each([
    ['en', 'Open email draft', 'Excerpt (shown only here)'],
    ['de', 'E-Mail-Entwurf öffnen', 'Auszug (nur hier sichtbar)'],
  ])('explains the reviewable draft in %s', async (locale, action, excerptLabel) => {
    const { AiFeedbackModal } = await import('../src/renderer/components/AiFeedbackModal.js');
    const { DesktopI18nProvider } = await import('../src/renderer/i18n.js');
    vi.stubGlobal('localStorage', { getItem: () => locale });
    try {
      const html = renderToStaticMarkup(createElement(DesktopI18nProvider, {
        children: createElement(AiFeedbackModal, { open: true, messageContent: 'Local excerpt', onClose: () => {} }),
      }));
      expect(html).toContain(action);
      expect(html).toContain(excerptLabel);
      expect(html).toContain('support@lastbrowser.com');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('opens a reviewable draft to support with only the selected reason and typed details', async () => {
    const { openAiFeedbackDraft } = await import('../src/renderer/components/AiFeedbackModal.js');
    const openExternal = vi.fn().mockResolvedValue(true);
    const comments = 'Harmful & misleading. ?cc=someone@example.invalid';
    expect(await openAiFeedbackDraft('harmful', comments, openExternal)).toBe(true);
    expect(openExternal).toHaveBeenCalledOnce();
    const url = new URL(openExternal.mock.calls[0][0]);
    expect(url.protocol).toBe('mailto:');
    expect(url.pathname).toBe('support@lastbrowser.com');
    expect([...url.searchParams.keys()]).toEqual(['subject', 'body']);
    expect(url.searchParams.get('subject')).toBe('LastBrowser AI response report');
    expect(url.searchParams.get('body')).toBe(`Reason: Inappropriate, misleading, or disruptive content\r\n\r\n${comments}`);
  });

  it('reports an unavailable email app without claiming the feedback was sent', async () => {
    const { openAiFeedbackDraft } = await import('../src/renderer/components/AiFeedbackModal.js');
    const openExternal = vi.fn().mockRejectedValue(new Error('no handler'));
    expect(await openAiFeedbackDraft('harmful', '', openExternal)).toBe(false);
  });

  it('preserves the manual reporting option when details exceed the Windows URL limit', async () => {
    const { openAiFeedbackDraft } = await import('../src/renderer/components/AiFeedbackModal.js');
    const openExternal = vi.fn();
    expect(await openAiFeedbackDraft('harmful', '界'.repeat(250), openExternal)).toBe(false);
    expect(openExternal).not.toHaveBeenCalled();
  });

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
