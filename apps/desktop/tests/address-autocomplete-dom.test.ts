import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type ViteDevServer } from 'vite';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import electronPath from 'electron';

let server: ViteDevServer;
let results: Record<string, { submitted: string; selected: string; value: string; open: boolean; focusedInput: boolean }>;
// Electron still requires an X display on Linux even for an offscreen window.
describe.skipIf(process.platform === 'linux' && !process.env.DISPLAY)('actual React omnibox keyboard DOM behavior', () => {
  beforeAll(async () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'lastbrowser-omnibox-'));
    server = await createServer({
      configFile: false, root: process.cwd(), cacheDir: path.join(directory, 'vite-cache'),
      optimizeDeps: { entries: ['tests/fixtures/omnibox-keyboard.html'] },
      server: { host: '127.0.0.1', port: 0, watch: null }
    });
    await server.listen();
    // Prepare the fixture's actual import graph before the native keyboard clock.
    // Scanning every HTML entry also prepares the unrelated production App.
    let preparationTimeout: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        (async () => {
          await server.warmupRequest('/tests/fixtures/omnibox-keyboard.tsx');
          await server.waitForRequestsIdle();
        })(),
        new Promise<never>((_resolve, reject) => {
          preparationTimeout = setTimeout(() => reject(new Error(`Omnibox fixture preparation exceeded its 10-second deadline; proof: ${directory}`)), 10000);
        })
      ]);
    } finally {
      if (preparationTimeout) clearTimeout(preparationTimeout);
    }
    const address = server.httpServer!.address() as { port: number };
    const env = { ...process.env, LASTBROWSER_OMNIBOX_PROOF_DIR: directory, LASTBROWSER_OMNIBOX_PROOF_URL: `http://127.0.0.1:${address.port}/tests/fixtures/omnibox-keyboard.html` };
    delete env.ELECTRON_RUN_AS_NODE;
    await new Promise<void>((resolve, reject) => {
      const require = createRequire(import.meta.url);
      const executable = process.platform === 'win32' ? path.join(path.dirname(require.resolve('electron/package.json')), 'dist', 'electron.exe') : String(electronPath);
      const child = spawn(executable, [path.resolve('tests/fixtures/omnibox-keyboard-probe.cjs')], { env, windowsHide: true, stdio: 'pipe' });
      let output = '';
      const errorFile = path.join(directory, 'error.txt');
      const diagnostics = () => `${output}\n${existsSync(errorFile) ? readFileSync(errorFile, 'utf8') : 'No probe error was written'}\nProof: ${directory}`;
      const timeout = setTimeout(() => { child.kill(); reject(new Error(`Electron DOM probe exceeded its 45-second deadline: ${diagnostics()}`)); }, 45000);
      child.stderr.on('data', chunk => { output += chunk; });
      child.on('error', error => { clearTimeout(timeout); reject(error); });
      child.on('exit', code => {
        clearTimeout(timeout);
        code === 0 ? resolve() : reject(new Error(`Electron DOM probe failed (${code}): ${diagnostics()}`));
      });
    });
    results = JSON.parse(readFileSync(path.join(directory, 'result.json'), 'utf8'));
    console.info(`Omnibox DOM proof: ${directory}`);
  }, 60000);
  afterAll(async () => { await server?.close(); });
  it.each([
    ['google', 'https://www.google.com/'], ['empty', 'https://www.google.com/search?q=go'],
    ['other', 'https://goats.example/'], ['tab', 'https://goats.example/'], ['up', 'https://www.google.com/search?q=go'],
    ['escape', 'https://www.google.com/search?q=go'], ['searchOverride', 'https://www.google.com/search?q=go'],
    ['url', 'https://example.org/path'], ['query', 'https://duckduckgo.com/?q=gardening%20tips'],
    ['retype', 'https://www.google.com/'], ['private', 'https://www.google.com/search?q=go'],
    ['otherProfile', 'https://www.google.com/search?q=go'], ['legacyMulti', 'https://www.google.com/search?q=go'],
    ['legacySingle', 'https://www.google.com/'], ['loose', 'https://www.google.com/search?q=og']
  ])('%s submits the visible completion or original search', (name, url) => { expect(results[name].submitted).toBe(url); });
  it('visibly selects Google and keeps original text after Escape', () => {
    expect(results.googleBeforeEnter.selected).toContain('Google');
    expect(results.googleBeforeEnter.open).toBe(true);
    expect(results.escapeBeforeEnter).toMatchObject({ value: 'go', open: false });
    expect(results.queryBeforeEnter.selected).toContain('gardening tips');
  });
  it('lets Tab leave the input after Escape or with an empty field', () => {
    expect(results.escapeTabFocus).toMatchObject({ open: false, focusedInput: false });
    expect(results.emptyTabFocus).toMatchObject({ open: false, focusedInput: false });
  });
});
