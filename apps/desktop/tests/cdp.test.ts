import { describe, expect, it } from 'vitest';
import { DEFAULT_CDP_PORT, formatCdpUrl, resolveCdpPort } from '../src/main/cdp.js';

describe('cdp (Chrome DevTools Protocol Port Resolution)', () => {
  it('returns DEFAULT_CDP_PORT (9222) when no environment or arguments are provided', () => {
    expect(DEFAULT_CDP_PORT).toBe(9222);
    expect(resolveCdpPort({}, [])).toBe(9222);
  });

  it('resolves port from LASTBROWSER_CDP_PORT environment variable', () => {
    const port = resolveCdpPort({ LASTBROWSER_CDP_PORT: '9333' }, []);
    expect(port).toBe(9333);
  });

  it('resolves port from CDP_PORT environment variable as fallback', () => {
    const port = resolveCdpPort({ CDP_PORT: '9444' }, []);
    expect(port).toBe(9444);
  });

  it('prioritizes LASTBROWSER_CDP_PORT over CDP_PORT', () => {
    const port = resolveCdpPort(
      { LASTBROWSER_CDP_PORT: '9555', CDP_PORT: '9444' },
      []
    );
    expect(port).toBe(9555);
  });

  it('resolves port from --remote-debugging-port command line argument', () => {
    const port = resolveCdpPort(
      {},
      ['Lastbrowser.exe', '--remote-debugging-port=9666', '--no-sandbox']
    );
    expect(port).toBe(9666);
  });

  it('prioritizes environment variable over command line argument', () => {
    const port = resolveCdpPort(
      { LASTBROWSER_CDP_PORT: '9777' },
      ['Lastbrowser.exe', '--remote-debugging-port=9666']
    );
    expect(port).toBe(9777);
  });

  it('falls back to default if environment variable is not a valid positive number', () => {
    expect(resolveCdpPort({ LASTBROWSER_CDP_PORT: 'invalid' }, [])).toBe(9222);
    expect(resolveCdpPort({ LASTBROWSER_CDP_PORT: '-10' }, [])).toBe(9222);
    expect(resolveCdpPort({ LASTBROWSER_CDP_PORT: '0' }, [])).toBe(9222);
  });

  it('falls back to default if command line argument port is not a valid positive number', () => {
    expect(
      resolveCdpPort({}, ['Lastbrowser.exe', '--remote-debugging-port=abc'])
    ).toBe(9222);
    expect(
      resolveCdpPort({}, ['Lastbrowser.exe', '--remote-debugging-port=-5'])
    ).toBe(9222);
  });

  it('formats CDP URL correctly with formatCdpUrl', () => {
    expect(formatCdpUrl(9222)).toBe('http://127.0.0.1:9222');
    expect(formatCdpUrl(9333)).toBe('http://127.0.0.1:9333');
  });
});
