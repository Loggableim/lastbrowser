import { beforeEach, describe, expect, it, vi } from 'vitest';
import path from 'node:path';

const { handle, fetchAsset } = vi.hoisted(() => ({
  handle: vi.fn(),
  fetchAsset: vi.fn(async (url: string) => new Response(url))
}));

vi.mock('electron', () => ({
  protocol: { handle, registerSchemesAsPrivileged: vi.fn() },
  net: { fetch: fetchAsset }
}));

import { installAppProtocolHandler, resolveAppAssetPath } from '../src/main/app-protocol.js';

describe('app protocol asset resolution', () => {
  beforeEach(() => {
    handle.mockReset();
    fetchAsset.mockClear();
  });

  it('maps renderer paths and the root index to files below the renderer directory', () => {
    const root = 'C:/lastbrowser/dist/renderer';
    expect(resolveAppAssetPath(root, '/assets/app.js')).toBe(path.resolve(root, 'assets', 'app.js'));
    expect(resolveAppAssetPath(root, '/')).toBe(path.resolve(root, 'index.html'));
  });

  it('rejects encoded traversal, sibling-prefix paths, and malformed escapes', () => {
    const root = 'C:/lastbrowser/dist/renderer';
    expect(resolveAppAssetPath(root, '/%2e%2e%2frenderer-secrets%2ftoken.txt')).toBeNull();
    expect(resolveAppAssetPath(root, '/%2e%2e%2fother%2fsecret.txt')).toBeNull();
    expect(resolveAppAssetPath(root, '/%E0%A4%A')).toBeNull();
  });

  it('serves only the canonical app host and never fetches rejected paths', async () => {
    installAppProtocolHandler('C:/lastbrowser/dist/renderer');
    const listener = handle.mock.calls[0][1] as (request: { url: string }) => Promise<Response>;

    const valid = await listener({ url: 'app://bundle/index.html' });
    expect(valid.status).toBe(200);
    expect(fetchAsset).toHaveBeenCalledTimes(1);

    const foreignHost = await listener({ url: 'app://other/index.html' });
    const traversal = await listener({ url: 'app://bundle/%2e%2e%2frenderer-secrets%2ftoken.txt' });
    expect(foreignHost.status).toBe(404);
    expect(traversal.status).toBe(404);
    expect(fetchAsset).toHaveBeenCalledTimes(1);
  });

  it('prevents a cached document from keeping a previous renderer bundle after an update', async () => {
    installAppProtocolHandler('C:/lastbrowser/dist/renderer');
    const listener = handle.mock.calls.at(-1)![1] as (request: { url: string }) => Promise<Response>;

    const document = await listener({ url: 'app://bundle/index.html' });
    const asset = await listener({ url: 'app://bundle/assets/index-new.js' });

    expect(document.headers.get('Cache-Control')).toBe('no-store, no-cache, must-revalidate');
    expect(document.headers.get('Pragma')).toBe('no-cache');
    expect(asset.headers.get('Cache-Control')).toBeNull();
  });
});
