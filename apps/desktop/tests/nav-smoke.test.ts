import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type ViteDevServer } from 'vite';
import electronPath from 'electron';
import { matchBrowserShortcut } from '../src/main/shortcuts.js';

const renderer = resolve(process.cwd(), 'src/renderer');
const read = (file: string) => readFileSync(resolve(renderer, file), 'utf8');

function cssRule(css: string, selector: string, nextSelector: string): string {
  const start = css.indexOf(selector);
  const end = css.indexOf(nextSelector, start + selector.length);
  expect(start, selector).toBeGreaterThanOrEqual(0);
  expect(end, nextSelector).toBeGreaterThan(start);
  return css.slice(start, end);
}

describe('A-007 navigation smoke', () => {
  it('keeps the first-run backdrop from swallowing sidebar and top-navigation clicks', () => {
    const css = read('styles.css');
    const wrap = cssRule(css, '.first-run-fullscreen-wrap {', '.first-run-fullscreen {');
    const panel = cssRule(css, '.first-run-fullscreen {', '.first-run-ai-choice-screen {');
    // Gegenprobe: pointer-events: auto on the wrap makes this assertion fail.
    expect(wrap).toContain('pointer-events: none;');
    expect(wrap).not.toMatch(/pointer-events:\s*auto/);
    expect(panel).toContain('pointer-events: auto;');
  });

  it('keeps top navigation and the tab strip wired to actions', () => {
    const header = read('components/HeaderComponents.tsx');
    expect(header).toContain('className="titlebar-tool-btn sidebar-toggle"');
    expect(header).toContain('onClick={onToggleSidebar}');
    expect(header).toContain('className="titlebar-tool-btn nav-back"');
    expect(header).toContain('onClick={onGoBack}');
    expect(header).toContain('className="titlebar-tool-btn nav-forward"');
    expect(header).toContain('onClick={onGoForward}');
    expect(header).toContain('className="titlebar-tool-btn nav-reload"');
    expect(header).toContain('onClick={onReloadOrStop}');
    expect(header).toContain("aria-label={t('browser.chrome.tabs')}");
    expect(header).toContain('onClick={() => onActivateTab(tab.id)}');
    expect(header).toContain('className="new-tab" onClick={onNewTab}');
  });

  it('keeps sidebar drawer entries clickable', () => {
    const sidebar = read('components/SidekickSidebar.tsx');
    expect(sidebar).toContain("onClick={() => handleDrawerTabChange('tabs')}");
    expect(sidebar).toContain("onClick={() => handleDrawerTabChange('ai')}");
    expect(sidebar).toContain("onClick={() => onSetMode('slim')}");
  });

  it('switches tabs and the sidebar from the keyboard shortcuts', () => {
    expect(matchBrowserShortcut({ type: 'keyDown', key: 'Tab', control: true })).toEqual({ action: 'next-tab' });
    expect(matchBrowserShortcut({ type: 'keyDown', key: 'Tab', control: true, shift: true })).toEqual({ action: 'prev-tab' });
    expect(matchBrowserShortcut({ type: 'keyDown', key: 'b', control: true })).toEqual({ action: 'toggle-sidebar' });
    const app = read('App.tsx');
    expect(app).toContain("case 'next-tab':");
    expect(app).toContain("case 'prev-tab':");
    expect(app).toContain("case 'toggle-sidebar':");
    expect(app).toContain('setActiveTabId(allTabs[nextIdx].id)');
    expect(app).toContain('setActiveTabId(allTabs[prevIdx].id)');
    expect(app).toContain('cycleSidebarMode();');
  });
});

describe('A-007 navigation clicks through the real controls', () => {
  let server: ViteDevServer;
  let directory = '';
  let result: {
    clicked: {
      clicks: Record<string, { ok: boolean; reason?: string; wrapEvents?: string | null; hit?: string | null }>;
      beforeKeys: { log: string; state: string };
      afterKeys: { log: string; state: string };
    };
  };

  beforeAll(async () => {
    directory = mkdtempSync(path.join(tmpdir(), 'lastbrowser-nav-smoke-'));
    server = await createServer({
      configFile: false,
      root: process.cwd(),
      cacheDir: path.join(directory, 'vite-cache'),
      optimizeDeps: { entries: ['tests/fixtures/nav-smoke.html'], include: ['dompurify', 'marked'] },
      server: { host: '127.0.0.1', port: 0, watch: null }
    });
    await server.listen();
    await server.warmupRequest('/tests/fixtures/nav-smoke.tsx');
    await server.waitForRequestsIdle();
    const address = server.httpServer!.address() as { port: number };
    const env = {
      ...process.env,
      LASTBROWSER_NAV_PROOF_DIR: directory,
      LASTBROWSER_NAV_PROOF_URL: `http://127.0.0.1:${address.port}/tests/fixtures/nav-smoke.html`
    };
    delete env.ELECTRON_RUN_AS_NODE;
    await new Promise<void>((resolvePromise, reject) => {
      const require = createRequire(import.meta.url);
      const executable = process.platform === 'win32'
        ? path.join(path.dirname(require.resolve('electron/package.json')), 'dist', 'electron.exe')
        : String(electronPath);
      const child = spawn(executable, [path.resolve('tests/fixtures/nav-smoke-probe.cjs')], {
        env,
        windowsHide: true,
        stdio: 'pipe'
      });
      let output = '';
      const errorFile = path.join(directory, 'error.txt');
      const diagnostics = () => `${output}\n${existsSync(errorFile) ? readFileSync(errorFile, 'utf8') : 'No probe error was written'}\nProof: ${directory}`;
      const timeout = setTimeout(() => {
        child.kill();
        reject(new Error(`Navigation DOM probe exceeded its 60-second deadline: ${diagnostics()}`));
      }, 60000);
      child.stderr.on('data', (chunk) => { output += chunk; });
      child.stdout.on('data', (chunk) => { output += chunk; });
      child.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
      child.on('exit', (code) => {
        clearTimeout(timeout);
        code === 0 ? resolvePromise() : reject(new Error(`Navigation DOM probe failed (${code}): ${diagnostics()}`));
      });
    });
    result = JSON.parse(readFileSync(path.join(directory, 'result.json'), 'utf8'));
  }, 90000);

  afterAll(async () => {
    await server?.close();
  });

  it('clicks sidebar, tab strip and top navigation through the first-run backdrop', () => {
    for (const name of ['ai', 'slim', 'back', 'forward', 'reload', 'tab', 'newTab', 'toggle']) {
      expect(result.clicked.clicks[name], name).toMatchObject({ ok: true, wrapEvents: 'none' });
    }
    expect(result.clicked.beforeKeys.log).toBe('drawer:ai,set-mode:slim,back,forward,reload,activate:tab-b,new-tab,click-toggle-sidebar');
    expect(result.clicked.beforeKeys.state).toBe('expanded|tab-b|ai');
  });

  it('applies tab and sidebar shortcut effects', () => {
    expect(result.clicked.afterKeys.log).toBe('drawer:ai,set-mode:slim,back,forward,reload,activate:tab-b,new-tab,click-toggle-sidebar,next-tab,prev-tab,toggle-sidebar');
    expect(result.clicked.afterKeys.state).toBe('hidden|tab-b|ai');
  });
});
