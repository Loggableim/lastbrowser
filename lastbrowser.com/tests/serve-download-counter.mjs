// Local review only. Default response is a labeled deterministic test fixture;
// --live reads the anonymous GitHub aggregate through the production function.
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile, stat } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
const root = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const source = readFileSync(path.join(root, 'functions/api/download-count.js'), 'utf8');
const { createDownloadCountHandler } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
const cacheEntries = new Map();
const cache = { async match(key) { return cacheEntries.get(key.url)?.clone(); }, async put(key, value) { cacheEntries.set(key.url, value.clone()); } };
const live = process.argv.includes('--live');
const fixture = [{ id: 1, draft: false, published_at: '2026-10-04T00:00:00Z', assets: [
  { id: 1, state: 'uploaded', name: 'Lastbrowser-0.1.44-x64-setup.exe', download_count: 12000 },
  { id: 2, state: 'uploaded', name: 'Lastbrowser-0.1.44-x64-portable.exe', download_count: 3456 },
] }];
const handler = createDownloadCountHandler({ getCache: () => cache,
  fetcher: live ? fetch : async () => new Response(JSON.stringify(fixture)) });
const contentTypes = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };
const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://127.0.0.1');
    if (url.pathname === '/api/download-count') {
      const result = await handler({ request: new Request(url) });
      response.writeHead(result.status, Object.fromEntries(result.headers)); response.end(await result.text()); return;
    }
    const decoded = decodeURIComponent(url.pathname);
    let file = path.resolve(root, '.' + decoded);
    if (!file.startsWith(root + path.sep) && file !== root) throw new Error('Outside website');
    if ((await stat(file)).isDirectory()) file = path.join(file, 'index.html');
    response.writeHead(200, { 'content-type': contentTypes[path.extname(file)] || 'application/octet-stream' });
    response.end(await readFile(file));
  } catch { response.writeHead(404); response.end('Not found'); }
});
server.listen(0, '127.0.0.1', () => console.log(JSON.stringify({ url: `http://127.0.0.1:${server.address().port}`, mode: live ? 'public-live-count' : 'deterministic-test-fixture-not-real-count' })));
