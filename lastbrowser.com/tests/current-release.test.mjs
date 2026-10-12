import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const root = new URL('../', import.meta.url);
const locales = ['', 'en/', 'es/', 'fr/', 'it/', 'ja/', 'pt/'];
const hashes = [
  '0b827dd9069edd74aab5c457422483c82ed4f57a4b18bb2648affa94556897f2',
  'fb62b810fdab8a46cc7ca8861ee1e9b2caeb13ee2efcd8000a8d5f101faf8aa6',
];
const read = (path) => readFileSync(new URL(path, root), 'utf8');

test('all seven current downloads bind v0.1.55 names and hashes to the published assets', () => {
  for (const locale of locales) {
    const html = read(`${locale}download/index.html`);
    for (const kind of ['setup', 'portable']) {
      assert.ok(html.includes(`releases/download/v0.1.55/Lastbrowser-0.1.55-x64-${kind}.exe`), locale);
    }
    for (const hash of hashes) assert.ok(html.includes(hash), locale);
    assert.doesNotMatch(html, /releases\/download\/v0\.1\.(?:45|52|53)\//);
    assert.ok(html.includes('Ctrl+R') || html.includes('Strg+R'), locale);
    assert.ok(html.includes('VM'), locale);
    const landing = read(`${locale}index.html`);
    assert.match(landing, /"softwareVersion": "0\.1\.55 Beta"/);
    assert.ok(read(`${locale}changelog/index.html`).includes('id="v0.1.55"'), locale);
  }
});

test('social icons have intrinsic dimensions and currentColor even without the shared stylesheet', () => {
  for (const locale of locales) {
    const html = read(`${locale}download/index.html`);
    const footer = html.slice(html.indexOf('<footer>'));
    const icons = [...footer.matchAll(/<svg\b[^>]*>/g)];
    assert.equal(icons.length, 2, locale);
    for (const [icon] of icons) {
      assert.match(icon, /width="22"/);
      assert.match(icon, /height="22"/);
      assert.match(icon, /fill="currentColor"/);
    }
    assert.ok(footer.includes('<span>X</span>'));
    assert.ok(footer.includes('<span>Bluesky</span>'));
    assert.doesNotMatch(footer, /Commercial Licensing/);
  }
});

test('download proxy follows the current published release while historical changelog remains', () => {
  const proxy = read('functions/downloads/[file].js');
  assert.ok(proxy.includes("const RELEASE_TAG = 'v0.1.55'"));
  assert.doesNotMatch(proxy, /0\.1\.53/);
  assert.ok(read('changelog/feed.xml').includes('lastbrowser-v0.1.55'));
  assert.ok(read('changelog/feed.xml').includes('lastbrowser-v0.1.53'));
});
