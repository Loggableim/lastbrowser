#!/usr/bin/env node
// Controlled Electron render for provider selection across an async profile switch.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');

const fixture = String.raw`
import React from 'react';
import { createRoot } from 'react-dom/client';
import { ProviderWorkspace } from './src/renderer/components/ProviderWorkspace';

const providers = [
  {id:'provider-a', label:'Provider A', mark:'A'},
  {id:'provider-b', label:'Provider B', mark:'B'}
];
let root;
let current = {scopeKey:'profile-a', initialProviderId:'provider-a'};
function render() {
  root.render(<ProviderWorkspace providers={providers} {...current} providerListLabel="Providers"
    tabsAriaLabel="Provider settings" emptyMessage="No providers"
    tabLabels={{connection:'Connection',models:'Models',chat:'Chat default'}}
    panel={(provider, tab) => <p>{provider.label}: {tab}</p>} />);
}
root = createRoot(document.getElementById('root'));
window.__providerWorkspaceProbe = {
  update(scopeKey, initialProviderId) { current = {scopeKey, initialProviderId}; render(); }
};
render();
`;

async function main() {
  const rootDir = path.resolve(__dirname, '../../..');
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'lastbrowser-provider-workspace-'));
  try {
    require('esbuild').buildSync({
      stdin: { contents: fixture, loader: 'tsx', resolveDir: path.join(rootDir, 'apps/desktop') },
      bundle: true, platform: 'browser', format: 'iife', target: 'chrome130',
      loader: { '.css': 'empty' }, outfile: path.join(temp, 'fixture.js')
    });
    fs.writeFileSync(path.join(temp, 'index.html'), '<!doctype html><html><head><meta charset="utf-8"></head><body><div id="root"></div><script src="fixture.js"></script></body></html>');
    const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
    const electronPackage = require.resolve('electron/package.json');
    const executable = process.platform === 'win32' ? path.join(path.dirname(electronPackage), 'dist', 'electron.exe') : require('electron');
    const child = spawn(executable, [__filename, '--child', temp], { cwd: rootDir, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', value => stdout += value.toString());
    child.stderr.on('data', value => stderr += value.toString());
    const result = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { child.kill(); reject(new Error(`ProviderWorkspace render exceeded 45s: ${stderr}`)); }, 45000);
      child.once('error', error => { clearTimeout(timer); reject(error); });
      child.once('exit', (code, signal) => { clearTimeout(timer); resolve({ code, signal }); });
    });
    assert.deepEqual(result, { code: 0, signal: null }, `Electron render failed: ${stderr}\n${stdout}`);
    assert.match(stdout, /provider-workspace-scope-switch:passed/);
    process.stdout.write(stdout);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
}

async function child(temp) {
  const { app, BrowserWindow } = require('electron');
  let win;
  try {
    app.setPath('userData', path.join(temp, 'user-data'));
    await app.whenReady();
    win = new BrowserWindow({ show: false, width: 1000, height: 700, webPreferences: { contextIsolation: true, nodeIntegration: false, backgroundThrottling: false, offscreen: true } });
    await win.loadFile(path.join(temp, 'index.html'));
    const run = script => win.webContents.executeJavaScript(script);
    const until = async (script, label) => {
      const deadline = Date.now() + 8000;
      while (Date.now() < deadline) { if (await run(script)) return; await new Promise(resolve => setTimeout(resolve, 20)); }
      throw new Error(`Timeout waiting for ${label}: ${await run("document.querySelector('.provider-workspace-heading')?.innerText")}`);
    };
    await until("document.querySelector('.provider-workspace-heading')?.innerText.includes('Provider A')", 'profile A provider');
    await run("document.querySelectorAll('.provider-workspace-item')[1].click()");
    await until("document.querySelector('.provider-workspace-heading')?.innerText.includes('Provider B')", 'manual selection');
    await run("window.__providerWorkspaceProbe.update('profile-b', 'provider-a')");
    await until("document.querySelector('.provider-workspace')?.dataset.providerScope === 'profile-b'", 'profile B with previous provider still loading');
    await run("window.__providerWorkspaceProbe.update('profile-b', 'provider-b')");
    await until("document.querySelector('.provider-workspace-heading')?.innerText.includes('Provider B')", 'resolved provider B');
    const final = await run("({scope:document.querySelector('.provider-workspace')?.dataset.providerScope, heading:document.querySelector('.provider-workspace-heading')?.innerText, pressed:[...document.querySelectorAll('.provider-workspace-item')].map(x=>x.getAttribute('aria-pressed'))})");
    assert.equal(final.scope, 'profile-b');
    assert.match(final.heading, /Provider B$/);
    assert.deepEqual(final.pressed, ['false', 'true']);
    process.stdout.write(`provider-workspace-scope-switch:passed ${JSON.stringify(final)}\n`);
    await app.exit(0);
  } catch (error) { console.error(error); await app.exit(1); }
  finally { if (win && !win.isDestroyed()) win.destroy(); }
}

if (process.argv[2] === '--child') void child(process.argv[3]);
else void main().catch(error => { console.error(error); process.exitCode = 1; });
