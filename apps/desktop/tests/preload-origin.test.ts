import { describe, expect, it } from 'vitest';
import { isTrustedPreloadDocumentUrl } from '../src/main/preload-origin.js';

describe('privileged preload document origin', () => {
  it('allows the bundled application origin and exact Vite development origin', () => {
    expect(isTrustedPreloadDocumentUrl('app://bundle/index.html')).toBe(true);
    expect(isTrustedPreloadDocumentUrl('http://127.0.0.1:5173/')).toBe(true);
  });

  it('refuses remote, file, untrusted app, and unrelated loopback documents', () => {
    for (const url of [
      'https://attacker.example/',
      'http://127.0.0.1:5174/',
      'http://localhost:5173/',
      'file:///C:/private/index.html',
      'app://bundle.evil/index.html',
      'app://other/index.html',
      'javascript:alert(1)',
      'not a URL'
    ]) {
      expect(isTrustedPreloadDocumentUrl(url), url).toBe(false);
    }
  });

  it('refuses credentials embedded in a nominally trusted URL', () => {
    expect(isTrustedPreloadDocumentUrl('http://user:pass@127.0.0.1:5173/')).toBe(false);
    expect(isTrustedPreloadDocumentUrl('app://user:pass@bundle/index.html')).toBe(false);
  });
});
