import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '..', '..', '..');

describe('public release download references', () => {
  it('links every localized Windows download page to the Microsoft Store', () => {
    const expected = [
      'download/index.html',
      'en/download/index.html',
      'es/download/index.html',
      'fr/download/index.html',
      'it/download/index.html',
      'ja/download/index.html',
      'pt/download/index.html',
    ] as const;
    for (const relativePath of expected) {
      const source = readFileSync(path.join(repoRoot, 'lastbrowser.com', relativePath), 'utf8');
      expect(source).toContain('https://apps.microsoft.com/detail/9NJX1T2KXDM3');
      expect(source).not.toMatch(/Lastbrowser-0\.1\.56-x64-(setup|portable)\.exe/i);
      expect(source).toContain('Lastbrowser-0.1.56-x86_64.AppImage');
      expect(source).toContain('Lastbrowser-0.1.56-x64.tar.gz');
    }
  });

  it('redirects Windows downloads to the Store and preserves the legacy update feed', () => {
    const source = readFileSync(path.join(repoRoot, 'lastbrowser.com/functions/downloads/[file].js'), 'utf8');
    expect(source).toContain("const RELEASE_TAG = 'v0.1.56';");
    expect(source).toContain('https://apps.microsoft.com/detail/9NJX1T2KXDM3');
    expect(source).toContain("file === 'setup.exe' || file === 'portable.exe'");
    expect(source).toContain('Response.redirect(WINDOWS_STORE_URL, 302)');
    expect(source).toContain('/${RELEASE_TAG}/latest.yml');
    expect(source).not.toContain('v0.1.34');
  });

  it('keeps localized home pages current and retains published changelog history', () => {
    const locales = ['', 'en/', 'es/', 'fr/', 'it/', 'ja/', 'pt/'];

    for (const locale of locales) {
      const home = readFileSync(path.join(repoRoot, 'lastbrowser.com', `${locale}index.html`), 'utf8');
      const changelog = readFileSync(path.join(repoRoot, 'lastbrowser.com', `${locale}changelog/index.html`), 'utf8');

      expect(home).toContain('Microsoft Store');
      expect(home).not.toContain('v0.1.56');
      expect(home).not.toContain('"softwareVersion": "0.1.56"');
      expect(home).not.toContain('v0.1.32 Beta');
      expect(changelog).toMatch(/v0\.1\.(52|53|56)/);
      expect(changelog).toContain('published release');
      expect(changelog).not.toContain('v0.1.35');
      expect(changelog).not.toMatch(/not yet published|not published|nicht veröffentlicht|no publicado|non publié|未公開/i);
    }
  });

  it('publishes the verified v0.1.52 sizes and digests in the release archive', () => {
    const archive = readFileSync(path.join(repoRoot, 'lastbrowser.com/releases/index.html'), 'utf8');
    const feed = readFileSync(path.join(repoRoot, 'lastbrowser.com/changelog/feed.xml'), 'utf8');
    expect(archive).toContain('161,228,424 Bytes');
    expect(archive).toContain('160,865,088 Bytes');
    expect(archive).toContain('D09747A3A5F55D9A4DA02A8644DE976D342EB2C811798B3778C242515F6BDACE');
    expect(archive).toContain('16EEC42D1D335112E90EC04A2AC66ACB2941A81A2D7DD229E35EAD7905C51BFF');
    expect(archive).toContain('v0.1.52');
    // The website source PR advances the feed independently from this app hotfix PR.
    expect(feed).toMatch(/<guid isPermaLink="false">lastbrowser-v0\.1\.(45|53)<\/guid>/);
    expect(feed).toMatch(/<pubDate>(Mon, 05 Oct 2026 08:57:03 GMT|Sun, 11 Oct 2026 01:42:02 GMT)<\/pubDate>/);
  });

  it('does not market the obsolete Gemini CLI subscription or dated model list', () => {
    const websiteRoot = path.join(repoRoot, 'lastbrowser.com');
    const sources = [
      'llms.txt',
      'llms-full.txt',
      'changelog/feed.xml',
      ...['', 'en/', 'es/', 'fr/', 'it/', 'ja/', 'pt/'].flatMap((locale) => [
        `${locale}index.html`,
        `${locale}features/index.html`,
        `${locale}changelog/index.html`,
      ]),
    ];

    for (const relativePath of sources) {
      const source = readFileSync(path.join(websiteRoot, relativePath), 'utf8');
      expect(source).not.toMatch(/Gemini\s*CLI|Gemini\s+2\.5|Gemini\s+1\.[05]|Multi-Account Gemini/i);
    }
  });
});
