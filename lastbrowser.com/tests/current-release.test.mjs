import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const rootPath = fileURLToPath(root);
const locales = ['', 'en/', 'es/', 'fr/', 'it/', 'ja/', 'pt/'];
const hashes = [
  '0b827dd9069edd74aab5c457422483c82ed4f57a4b18bb2648affa94556897f2',
  'fb62b810fdab8a46cc7ca8861ee1e9b2caeb13ee2efcd8000a8d5f101faf8aa6',
];
const read = (file) => readFileSync(new URL(file, root), 'utf8');
const commercialFooter = /Commercial Licensing|Licenciamiento Comercial|Licences Commerciales|Licenze Commerciali|Licenciamento Comercial|商用ライセンス窓口/;

function htmlFiles(dir) {
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...htmlFiles(full));
    else if (entry.name.endsWith('.html')) found.push(full);
  }
  return found;
}

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

test('footers in every language use Kontakt or Contact and bound social icons', () => {
  const seen = new Set();
  let highlights = 0;
  for (const file of htmlFiles(rootPath)) {
    const rel = path.relative(rootPath, file).split(path.sep).join('/');
    const html = readFileSync(file, 'utf8');
    const footerAt = html.indexOf('<footer');
    if (footerAt < 0) continue;
    const footer = html.slice(footerAt);
    assert.doesNotMatch(footer, commercialFooter, rel);
    assert.doesNotMatch(footer, />Lastbrowser</, rel);
    const highlight = footer.match(/class="footer-contact-highlight">([^<]+)</);
    if (highlight) {
      const expected = rel.startsWith('en/') ? 'Contact:' : 'Kontakt:';
      assert.equal(highlight[1].trim(), expected, rel);
      highlights += 1;
      const first = rel.split('/')[0];
      seen.add(['en', 'es', 'fr', 'it', 'ja', 'pt'].includes(first) ? first : 'de');
    }
    const socialAt = footer.indexOf('class="footer-social-links"');
    if (socialAt >= 0) {
      const social = footer.slice(socialAt, footer.indexOf('</nav>', socialAt));
      const icons = [...social.matchAll(/<svg\b[^>]*>/g)];
      assert.equal(icons.length, 2, rel);
      for (const [icon] of icons) {
        assert.match(icon, /width="22"/, rel);
        assert.match(icon, /height="22"/, rel);
        assert.match(icon, /fill="currentColor"/, rel);
      }
      assert.ok(social.includes('<span>X</span>'), rel);
      assert.ok(social.includes('<span>Bluesky</span>'), rel);
    }
  }
  for (const locale of ['de', 'en', 'es', 'fr', 'it', 'ja', 'pt']) assert.ok(seen.has(locale), locale);
  assert.ok(highlights >= 49, String(highlights));
});

test('download proxy follows the current published release while historical changelog remains', () => {
  const proxy = read('functions/downloads/[file].js');
  assert.ok(proxy.includes("const RELEASE_TAG = 'v0.1.55'"));
  assert.doesNotMatch(proxy, /0\.1\.53/);
  assert.ok(read('changelog/feed.xml').includes('lastbrowser-v0.1.55'));
  assert.ok(read('changelog/feed.xml').includes('lastbrowser-v0.1.53'));
});
