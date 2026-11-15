const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const fixture = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { FirstRunSetupPane } from './src/renderer/components/FirstRunSetupPane';
import { DesktopI18nProvider } from './src/renderer/i18n';

localStorage.setItem('lastbrowser.locale', 'en');
window.ollamaCatalogRequests = [];
window.providerScopeSelections = [];
const scope = {
  browserProfileId: 'fixture',
  backendProfileId: '11111111-1111-4111-8111-111111111111',
  spaceId: '22222222-2222-4222-8222-222222222222',
};
window.lastbrowser = {
  i18n: { setLocale: async () => {} },
  independent: { request: async ({ operation }) => ({
    ok: true, value: operation === 'resolveScope'
      ? { schemaVersion: 1, scope, backendProfileName: 'default', workspacePath: null,
          spaceName: 'Home', bindingRevision: 1, setupStatus: 'in_progress' }
      : { scope, groups: [] },
  }) },
  sidekick: {
    detectExistingInstall: async () => ({ found: false }),
    requestWebui: async (request) => {
      if (request.path === '/api/models/probe' && request.body.provider === 'ollama') {
        window.ollamaCatalogRequests.push(request.body.base_url);
        return { models: [{ id: 'smollm2:135m', label: 'smollm2:135m' }] };
      }
      if (request.path === '/api/models/probe' && request.body.provider === 'openrouter') {
        return new Promise(resolve => {
          window.finishCloudModelProbe = () => resolve({ models: [] });
        });
      }
      if (request.path === '/api/providers') window.providerScopeSelections.push(request.scopeSelection);
      return { providers: [] };
    },
  },
  system: {
    isDefaultBrowser: async () => false,
    discoverBrowserImport: async () => ({ profiles: [] }),
  },
};
const onboardingStatus = { setup: { providers: [
  { id: 'alibaba', label: 'Alibaba Cloud', requires_base_url: true },
  { id: 'ollama', label: 'Ollama', key_optional: true },
  { id: 'openrouter', label: 'OpenRouter' },
  { id: 'deepseek', label: 'DeepSeek' },
] } };
createRoot(document.getElementById('root')).render(<DesktopI18nProvider>
  <FirstRunSetupPane aiChoice="enabled" status={{ sidekick: 'ready', webuiHealth: 'ready' }}
    browserProfileId="fixture" onboardingStatus={onboardingStatus}
    error="" saving={false} setupLoading={false} />
</DesktopI18nProvider>);
`;

async function runRenderer(directory) {
  const { app, BrowserWindow } = require('electron');
  try {
    app.setPath('userData', path.join(directory, 'profile'));
    app.commandLine.appendSwitch('disable-component-update');
    await app.whenReady();
    const window = new BrowserWindow({ show: false, webPreferences: { backgroundThrottling: false } });
    await window.loadFile(path.join(directory, 'index.html'));
    const run = (script) => window.webContents.executeJavaScript(script);
    async function until(condition, label) {
      const end = Date.now() + 8000;
      while (Date.now() < end) {
        if (await run(condition)) return;
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      throw new Error(`Timed out waiting for ${label}: ${await run('document.body.innerText.slice(0, 400)')}`);
    }
    const next = '.setup-action-footer .primary-btn';
    for (let step = 0; step < 4; step += 1) {
      await until(`document.querySelector('${next}')?.disabled === false`, 'enabled Next button');
      await run(`document.querySelector('${next}').click()`);
    }
    await until("document.querySelector('#first-run-page-title')?.textContent === 'Connect your AI'", 'English provider step');
    await until("window.providerScopeSelections.some(scope => scope.browserProfileId === 'fixture' && scope.backendProfileName === 'default' && scope.workspacePath === null)", 'resolved backend profile for first-run catalog');
    const chip = (label) => `[...document.querySelectorAll('.provider-chip')].find(button => button.querySelector('strong').textContent === '${label}')`;
    const toggle = "document.querySelector('[data-testid=provider-beta-catalog-toggle] input')";
    assert.equal(await run(`${chip('OpenCode Free')}?.classList.contains('active')`), true, 'The default provider is visible and selected');
    await run(`${toggle}.click()`);
    await until(`Boolean(${chip('Alibaba Cloud')})`, 'Alibaba Cloud provider chip');
    await run(`${chip('Alibaba Cloud')}.click()`);
    const endpoint = "document.querySelector('.input-group input[type=text].key-input')";
    await until(`Boolean(${endpoint})`, 'Alibaba endpoint field');
    const previous = 'https://catalog.example.invalid/compatible-mode/v1';
    await run(`{
      const input = ${endpoint};
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '${previous}');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }`);
    assert.equal(await run(`${endpoint}.value`), previous);
    await run(`${chip('Ollama')}.click()`);
    await until(`${endpoint}?.placeholder.includes('11434')`, 'Ollama endpoint field');
    assert.equal(await run(`${endpoint}.value`), '', 'Ollama must start with a fresh endpoint');
    assert.equal(await run(`${chip('Ollama')}?.classList.contains('active')`), true, 'Ollama stays visible and selected');
    assert.equal(await run(`${endpoint}.parentElement.querySelector('.input-label').textContent`), 'Server address (optional)');
    const ollamaTip = await run("document.querySelector('.api-key-panel input[type=password]').parentElement.querySelector('small.field-hint').textContent.trim()");
    assert.equal(ollamaTip, 'Start Ollama in your terminal with ollama run llama3.2, or use a model such as qwen2.5 or deepseek-r1.');
    await until("Boolean(document.querySelector('.model-selection-area button:not(:disabled)'))", 'model reload button');
    assert.equal(await run("document.querySelector('.model-selection-area button').textContent"), 'Reload models');
    const localUrl = 'http://127.0.0.1:52087/v1';
    await run(`{
      const input = ${endpoint};
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '${localUrl}');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }`);
    await until("Boolean(document.querySelector('.model-selection-area button:not(:disabled)'))", 'model reload available after editing endpoint');
    assert.deepEqual(await run('window.ollamaCatalogRequests'), [], 'Editing an address does not probe it');
    await run("document.querySelector('.model-selection-area button').click()");
    await until("document.querySelector('.model-pill strong')?.textContent.includes('smollm2:135m')", 'installed local model');
    assert.deepEqual(await run('window.ollamaCatalogRequests'), [localUrl]);

    await run(`${chip('OpenRouter')}.click()`);
    const openRouterHint = await run("document.querySelector('.api-key-panel a[href*=openrouter]').parentElement.textContent.trim()");
    await run(`{
      const keyField = document.querySelector('.api-key-panel input[type=password]');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(keyField, 'fixture-key');
      keyField.dispatchEvent(new Event('input', { bubbles: true }));
    }`);
    await until("typeof window.finishCloudModelProbe === 'function'", 'pending cloud model probe');
    const cloudLoading = await run("document.querySelector('.api-key-panel button:disabled').textContent");
    await run("window.finishCloudModelProbe()");
    await run(`${chip('DeepSeek')}.click()`);
    const deepSeekHint = await run("document.querySelector('.api-key-panel a[href*=deepseek]').parentElement.textContent.trim()");
    assert.deepEqual({ openRouterHint, deepSeekHint, cloudLoading }, {
      openRouterHint: 'Create an API key at openrouter.ai/keys.',
      deepSeekHint: 'Create an API key on the DeepSeek Platform.',
      cloudLoading: 'Loading models…',
    });

    await run(`${chip('Ollama')}.click()`);
    await run(`${toggle}.click()`);
    await until(`${chip('OpenCode Free')}?.classList.contains('active')`, 'visible fallback after hiding the beta catalog');
    assert.equal(await run(`Boolean(${endpoint})`), false, 'The hidden beta provider no longer owns the settings form');
    console.log('First-run provider switching, model reload, and English provider copy passed.');
    app.exit(0);
  } catch (error) {
    console.error(error);
    app.exit(1);
  }
}

async function main() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'lastbrowser-first-run-provider-'));
  try {
    require('esbuild').buildSync({
      stdin: { contents: fixture, loader: 'tsx', resolveDir: path.resolve(__dirname, '..') },
      bundle: true, platform: 'browser', format: 'iife',
      define: { 'import.meta.url': JSON.stringify(pathToFileURL(path.join(directory, 'fixture.js')).href) },
      loader: { '.css': 'empty' }, outfile: path.join(directory, 'fixture.js'),
    });
    fs.writeFileSync(path.join(directory, 'index.html'), '<meta charset="utf-8"><div id="root"></div><script src="fixture.js"></script>');
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    const child = spawn(require('electron'), [__filename, '--renderer', directory], { env, stdio: 'inherit', windowsHide: true });
    const code = await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', resolve);
    });
    assert.equal(code, 0);
  } finally {
    assert.equal(path.dirname(directory), path.resolve(os.tmpdir()));
    assert.ok(path.basename(directory).startsWith('lastbrowser-first-run-provider-'));
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

if (process.argv[2] === '--renderer') {
  void runRenderer(process.argv[3]);
} else {
  void main().catch(error => { console.error(error); process.exitCode = 1; });
}
