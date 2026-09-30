import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '..', '..', '..');

describe('public release download references', () => {
  it('points every localized download page to the published v0.1.38 assets and digests', () => {
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
      expect(source).toContain('"softwareVersion": "0.1.38 Beta"');
      expect(source).toContain('/releases/download/v0.1.38/Lastbrowser-0.1.38-x64-setup.exe');
      expect(source).toContain('/releases/download/v0.1.38/Lastbrowser-0.1.38-x64-portable.exe');
      expect(source).toContain('E5BCB2AF721829D0BE9FD85E224F339D1F3757BC4741CB1B87CBAB248423CB17');
      expect(source).toContain('80E6FB63197E324731A7E2A2D658EC09BA4FFDF61F0C03B13105E6D54603E9B2');
      expect(source).not.toContain('/releases/download/v0.1.34/');
      expect(source).not.toMatch(/EV Code-Signed|EV Code Signing Certificate|EV-Code-Signed/i);
    }
  });

  it('proxies only the published tag for both binaries and the real updater metadata', () => {
    const source = readFileSync(path.join(repoRoot, 'lastbrowser.com/functions/downloads/[file].js'), 'utf8');
    expect(source).toContain("const RELEASE_TAG = 'v0.1.38';");
    expect(source).toContain('/${RELEASE_TAG}/Lastbrowser-0.1.38-x64-setup.exe');
    expect(source).toContain('/${RELEASE_TAG}/Lastbrowser-0.1.38-x64-portable.exe');
    expect(source).toContain('/${RELEASE_TAG}/latest.yml');
    expect(source).not.toContain('v0.1.34');
  });
});
