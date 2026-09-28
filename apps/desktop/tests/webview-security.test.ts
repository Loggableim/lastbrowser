import { describe, expect, it } from 'vitest';
import { hardenWebViewAttachment } from '../src/main/webview-security.js';

describe('WebView attachment security', () => {
  it('overrides renderer-supplied dangerous preferences and strips guest preload values', () => {
    const webPreferences: Record<string, unknown> = {
      nodeIntegration: true,
      nodeIntegrationInSubFrames: true,
      contextIsolation: false,
      sandbox: false,
      webSecurity: false,
      allowRunningInsecureContent: true,
      webviewTag: true,
      preload: 'https://attacker.example/preload.js',
      additionalArguments: ['--enable-exploit']
    };
    const params: Record<string, unknown> = {
      src: 'https://example.com/',
      partition: 'persist:lastbrowser-profile',
      plugins: 'true',
      preload: 'https://attacker.example/other-preload.js',
      preloadURL: 'file:///attacker.js'
    };

    hardenWebViewAttachment(webPreferences, params);

    expect(webPreferences).toMatchObject({
      nodeIntegration: false,
      nodeIntegrationInSubFrames: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false
    });
    expect(webPreferences).not.toHaveProperty('preload');
    expect(webPreferences).not.toHaveProperty('additionalArguments');
    expect(params).not.toHaveProperty('preload');
    expect(params).not.toHaveProperty('preloadURL');
    expect(params).toMatchObject({
      src: 'https://example.com/',
      partition: 'persist:lastbrowser-profile',
      plugins: 'true'
    });
  });

  it('preserves a controlled detached-transfer src override and existing guest settings', () => {
    const webPreferences: Record<string, unknown> = { plugins: true };
    const params: Record<string, unknown> = {
      src: 'about:blank',
      partition: 'persist:space-profile'
    };

    hardenWebViewAttachment(webPreferences, params);

    expect(params).toEqual({ src: 'about:blank', partition: 'persist:space-profile' });
    expect(webPreferences).toMatchObject({ plugins: true, sandbox: true, webSecurity: true });
  });
});
