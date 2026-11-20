import { execFile } from 'node:child_process';
import { once } from 'node:events';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { expect, it } from 'vitest';
import { visibleMainTextScript } from '../src/main/sidekick-visible-tab-text.js';

const chrome = process.env.LASTBROWSER_FIXTURE_CHROME
  ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';

it.skipIf(!existsSync(chrome))('extracts only visible, non-interactive prose using Chromium layout', async () => {
  const tmp = resolve(tmpdir());
  const userData = await mkdtemp(join(tmp, 'lastbrowser-visible-fixture-'));
  const server = createServer((_req, res) => {
    const { port } = server.address() as { port: number };
    const script = visibleMainTextScript(`http://127.0.0.1:${port}`);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(`<!doctype html><meta charset="utf-8"><style>
      body { margin: 0; font: 16px Arial; color: rgb(0,0,0); background: rgb(255,255,255) }
      main { padding: 16px } p { margin: 8px 0; }
      .covered { position: absolute; top: 200px; left: 18px }
      .overlay { position: absolute; top: 200px; left: 0; width: 400px; height: 70px; background: white }
      .pointerless { top: 275px; pointer-events: none; }
      .tiny-cover { position:absolute;top:353px;left:43px;width:7px;height:7px;background:white }
      .external-overlay::before { content:''; position:fixed; top:15px; width:8px; height:8px; background:white }
    </style><main>
      <h1>Authorized fixture heading</h1><p>Visible article prose <em>in this pane.</em></p>
      <p hidden>Hidden attribute text</p><p style="visibility:hidden">Invisible style text</p>
      <p style="opacity:0">Zero opacity text</p><p style="color:transparent">Transparent text</p>
      <p style="position:absolute;left:2000px">Offscreen text</p>
      <p style="position:absolute;left:-20px">Partly offscreen text</p>
      <p class="covered">Occluded text</p><div class="overlay"></div>
      <p class="covered" style="top:275px">Pointerless overlay text</p><div class="overlay pointerless"></div>
      <p class="covered" style="top:340px">Text with tiny cover between sample points</p><div class="tiny-cover"></div>
      <form><p>Fixture login label</p><label>Label text<input value="fixture-input-value"></label></form>
      <p contenteditable>Editable text</p><p><a href="/outside">Interactive link text</a></p>
      <p data-sensitive>Private value marked in markup</p><p style="-webkit-text-security:disc">Masked underlying text</p>
      <p>fixture@example.test</p><p>Readable closing paragraph.</p>
    </main><p id="overlay-source">Outside the article</p><output id="fixture-result"></output>
    <script>document.addEventListener('DOMContentLoaded', () => {
      const read = () => ${script};
      const result = { prose: read() };
      const marker = document.createElement('p');
      const value = document.createElement('p');
      value.textContent = 'short value';
      document.querySelector('main').append(marker, value);
      marker.textContent = 'Access token';
      result.credentialContext = read();
      marker.textContent = 'Bestätigungscode';
      result.localizedCredentialContext = read();
      marker.remove(); value.remove();
      document.querySelector('input').type = 'password';
      result.authForm = read();
      document.querySelector('input').type = 'text';
      document.querySelector('#overlay-source').classList.add('external-overlay');
      result.pseudoOverlay = read();
      document.getElementById('fixture-result').textContent = encodeURIComponent(JSON.stringify(result));
    });</script>`);
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const { port } = server.address() as { port: number };
    const { stdout } = await promisify(execFile)(chrome, [
      '--headless', '--disable-gpu', '--no-first-run', '--disable-background-networking', '--no-proxy-server',
      '--window-size=960,600', `--user-data-dir=${userData}`, '--dump-dom', `http://127.0.0.1:${port}`
    ], { windowsHide: true, timeout: 20_000 });
    const encoded = stdout.match(/<output id="fixture-result">([^<]*)<\/output>/)?.[1];
    expect(encoded).toBeDefined();
    expect(JSON.parse(decodeURIComponent(encoded!))).toEqual({
      prose: 'Authorized fixture heading\nVisible article prose in this pane.\nReadable closing paragraph.',
      credentialContext: '', localizedCredentialContext: '', authForm: '', pseudoOverlay: ''
    });
  } finally {
    await new Promise<void>(done => server.close(() => done()));
    if (dirname(resolve(userData)) === tmp) await rm(userData, { recursive: true, force: true, maxRetries: 4 });
  }
}, 45_000);
