import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '..', '..', '..');

describe('public release download references', () => {
  it('points every localized download page to the signed v0.1.52 assets and digests', () => {
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
      expect(source).toContain('"softwareVersion": "0.1.52 Beta"');
      expect(source).toContain('/releases/download/v0.1.52/Lastbrowser-0.1.52-x64-setup.exe');
      expect(source).toContain('/releases/download/v0.1.52/Lastbrowser-0.1.52-x64-portable.exe');
      expect(source).toContain('D09747A3A5F55D9A4DA02A8644DE976D342EB2C811798B3778C242515F6BDACE');
      expect(source).toContain('16EEC42D1D335112E90EC04A2AC66ACB2941A81A2D7DD229E35EAD7905C51BFF');
      expect(source).not.toContain('/releases/download/v0.1.45/');
      expect(source).not.toContain('/releases/download/v0.1.34/');
      expect(source).not.toMatch(/EV Code-Signed|EV Code Signing Certificate|EV-Code-Signed/i);
    }
  });

  it('proxies the tag still hardcoded in the download function', () => {
    const source = readFileSync(path.join(repoRoot, 'lastbrowser.com/functions/downloads/[file].js'), 'utf8');
    // The function file on release/v0.1.52 still names v0.1.45. Website scope stays with A-004b.
    expect(source).toContain("const RELEASE_TAG = 'v0.1.45';");
    expect(source).toContain('/${RELEASE_TAG}/Lastbrowser-0.1.45-x64-setup.exe');
    expect(source).toContain('/${RELEASE_TAG}/Lastbrowser-0.1.45-x64-portable.exe');
    expect(source).toContain('/${RELEASE_TAG}/latest.yml');
    expect(source).not.toContain('v0.1.34');
  });

  it('shows v0.1.52 as the current release across localized site entry points', () => {
    const locales = ['', 'en/', 'es/', 'fr/', 'it/', 'ja/', 'pt/'];

    for (const locale of locales) {
      const home = readFileSync(path.join(repoRoot, 'lastbrowser.com', `${locale}index.html`), 'utf8');
      const changelog = readFileSync(path.join(repoRoot, 'lastbrowser.com', `${locale}changelog/index.html`), 'utf8');

      expect(home).toContain('v0.1.52');
      expect(home).not.toContain('v0.1.32 Beta');
      expect(changelog).toContain('v0.1.52');
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
    // feed.xml on this tag still leads with the v0.1.45 item; do not pretend it was republished.
    expect(feed).toContain('<guid isPermaLink="false">lastbrowser-v0.1.45</guid>');
    expect(feed).toContain('<pubDate>Mon, 05 Oct 2026 08:57:03 GMT</pubDate>');
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
