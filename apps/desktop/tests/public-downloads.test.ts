import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '..', '..', '..');

describe('public release download references', () => {
  it('points every localized download page to the signed v0.1.45 assets and digests', () => {
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
      expect(source).toContain('"softwareVersion": "0.1.45 Beta"');
      expect(source).toContain('/releases/download/v0.1.45/Lastbrowser-0.1.45-x64-setup.exe');
      expect(source).toContain('/releases/download/v0.1.45/Lastbrowser-0.1.45-x64-portable.exe');
      expect(source).toContain('CCF1435947A415FE5A97BB5D908EDB79A519106877128C3E4D5F1B210236BC96');
      expect(source).toContain('8078CF5481CF9FA371FDB6DA79D39B85741FE97FC15ED30D4FE30B7D37B6A577');
      expect(source).not.toContain('/releases/download/v0.1.34/');
      expect(source).not.toMatch(/EV Code-Signed|EV Code Signing Certificate|EV-Code-Signed/i);
    }
  });

  it('proxies only the published tag for both binaries and the real updater metadata', () => {
    const source = readFileSync(path.join(repoRoot, 'lastbrowser.com/functions/downloads/[file].js'), 'utf8');
    expect(source).toContain("const RELEASE_TAG = 'v0.1.45';");
    expect(source).toContain('/${RELEASE_TAG}/Lastbrowser-0.1.45-x64-setup.exe');
    expect(source).toContain('/${RELEASE_TAG}/Lastbrowser-0.1.45-x64-portable.exe');
    expect(source).toContain('/${RELEASE_TAG}/latest.yml');
    expect(source).not.toContain('v0.1.34');
  });

  it('shows v0.1.45 as the current release across localized site entry points', () => {
    const locales = ['', 'en/', 'es/', 'fr/', 'it/', 'ja/', 'pt/'];

    for (const locale of locales) {
      const home = readFileSync(path.join(repoRoot, 'lastbrowser.com', `${locale}index.html`), 'utf8');
      const changelog = readFileSync(path.join(repoRoot, 'lastbrowser.com', `${locale}changelog/index.html`), 'utf8');

      expect(home).toContain('v0.1.45');
      expect(home).not.toContain('v0.1.32 Beta');
      expect(changelog).toContain('v0.1.45');
      expect(changelog).toContain('published release');
      expect(changelog).not.toContain('v0.1.35');
      expect(changelog).not.toMatch(/not yet published|not published|nicht veröffentlicht|no publicado|non publié|未公開/i);
    }
  });

  it('publishes the verified v0.1.45 sizes and digests in the release archive and RSS feed', () => {
    const archive = readFileSync(path.join(repoRoot, 'lastbrowser.com/releases/index.html'), 'utf8');
    const feed = readFileSync(path.join(repoRoot, 'lastbrowser.com/changelog/feed.xml'), 'utf8');
    expect(archive).toContain('175,963,336 Bytes');
    expect(archive).toContain('175,601,280 Bytes');
    expect(archive).toContain('CCF1435947A415FE5A97BB5D908EDB79A519106877128C3E4D5F1B210236BC96');
    expect(archive).toContain('8078CF5481CF9FA371FDB6DA79D39B85741FE97FC15ED30D4FE30B7D37B6A577');
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
