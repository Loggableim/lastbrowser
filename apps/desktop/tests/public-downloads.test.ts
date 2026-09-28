import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '..', '..', '..');

describe('public release download references', () => {
  it('points localized download pages to the latest published GitHub assets and their API digests', () => {
    const expected = [
      ['download/index.html', '76D7A7D3FB8EB4F67ACA212ED2CB243DB93FC8780B1A276C3693D0EF9FD26C9C'],
      ['en/download/index.html', '76D7A7D3FB8EB4F67ACA212ED2CB243DB93FC8780B1A276C3693D0EF9FD26C9C']
    ] as const;

    for (const [relativePath, setupHash] of expected) {
      const source = readFileSync(path.join(repoRoot, 'lastbrowser.com', relativePath), 'utf8');
      expect(source).toContain('/releases/download/v0.1.34/Lastbrowser-0.1.34-x64-setup.exe');
      expect(source).toContain('/releases/download/v0.1.34/Lastbrowser-0.1.34-x64-portable.exe');
      expect(source).toContain(setupHash);
      expect(source).toContain('ADA083FF9DE282CE1F98629367965A8AA51F46E60E52B59BC4D8475D05111748');
      expect(source).not.toContain('/releases/download/v0.1.35/');
      expect(source).not.toMatch(/EV Code-Signed|EV Code Signing Certificate|EV-Code-Signed/i);
    }
  });

  it('proxies only the published tag for both binaries and the real updater metadata', () => {
    const source = readFileSync(path.join(repoRoot, 'lastbrowser.com/functions/downloads/[file].js'), 'utf8');
    expect(source).toContain("const RELEASE_TAG = 'v0.1.34';");
    expect(source).toContain('/${RELEASE_TAG}/Lastbrowser-0.1.34-x64-setup.exe');
    expect(source).toContain('/${RELEASE_TAG}/Lastbrowser-0.1.34-x64-portable.exe');
    expect(source).toContain('/${RELEASE_TAG}/latest.yml');
    expect(source).not.toContain('version: 0.1.35');
  });
});
