import { describe, expect, it, vi } from 'vitest';
vi.mock('../src/main/auth-window.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/main/auth-window.js')>();
  return { ...actual, openAuthConnectWindow: vi.fn() };
});

import {
  browserOpenTabChannel,
  buildBrowserContextMenuTemplate,
  resolveContextMenuLabels,
  installWindowOpenBridge,
  openContextMenuExternalUrl
} from '../src/main/browser-context-menu.js';
import { openAuthConnectWindow } from '../src/main/auth-window.js';

describe('browser context menu', () => {
  it('searches selected text with the selected engine in a new tab', () => {
    const openLinkInNewTab = vi.fn();
    const template = buildBrowserContextMenuTemplate({ selectionText: '  C++ & 日本語  ', linkURL: '', pageURL: 'https://example.com', isEditable: false, editFlags: {} } as never,
      { canGoBack: false, canGoForward: false, openLinkInNewTab, copyText: vi.fn(), locale: 'de',
        searchEngine: { label: 'DuckDuckGo', search: query => `https://duckduckgo.com/?q=${encodeURIComponent(query)}` } });
    const search = template.find(item => item.label === 'Suche mit DuckDuckGo');
    expect(search).toBeDefined();
    (search!.click as () => void)();
    expect(openLinkInNewTab).toHaveBeenCalledWith('https://duckduckgo.com/?q=C%2B%2B%20%26%20%E6%97%A5%E6%9C%AC%E8%AA%9E');
  });
  it('uses Japanese native labels for Japanese regional locales', () => {
    expect(resolveContextMenuLabels('ja-JP').openLinkInNewTab).toBe('リンクを新しいタブで開く');
    expect(resolveContextMenuLabels('ja_JP').copyLink).toBe('リンクのアドレスをコピー');
  });
  it('routes Google sign-in popups into a secure same-session window and keeps other OAuth in Connect', () => {
    let openHandler: ((details: { url: string }) => { action: 'deny' | 'allow' }) | undefined;
    const setWindowOpenHandler = vi.fn((handler: typeof openHandler) => { openHandler = handler; });
    const send = vi.fn();
    const shellOpenExternal = vi.fn(async () => {});
    const contents = { setWindowOpenHandler } as never;
    const shell = { openExternal: shellOpenExternal } as never;

    installWindowOpenBridge(contents, () => ({ webContents: { send } } as never), shell);

    expect(setWindowOpenHandler).toHaveBeenCalledOnce();
    expect(openHandler?.({ url: 'https://example.com/path' })).toEqual({ action: 'deny' });
    expect(send).toHaveBeenCalledWith(browserOpenTabChannel, 'https://example.com/path');
    expect(openHandler?.({ url: 'http://example.com/path' })).toEqual({ action: 'deny' });
    expect(send).toHaveBeenLastCalledWith(browserOpenTabChannel, 'http://example.com/path');

    for (const url of ['file:///C:/Users/test/secret.txt', 'javascript:alert(1)', 'intent://open/#Intent;scheme=foo;end', 'mailto:test@example.com']) {
      expect(openHandler?.({ url })).toEqual({ action: 'deny' });
    }
    expect(shellOpenExternal).not.toHaveBeenCalled();

    const googlePopup = openHandler?.({ url: 'https://accounts.google.com/o/oauth2/v2/auth' });
    expect(googlePopup).toMatchObject({ action: 'allow' });
    expect(googlePopup).toHaveProperty('createWindow');
    expect(openAuthConnectWindow).not.toHaveBeenCalled();

    openHandler?.({ url: 'https://auth.openai.com/oauth/authorize' });
    expect(openAuthConnectWindow).toHaveBeenCalledOnce();
  });

  it('creates a sandboxed Google popup in the originating tab session', () => {
    let openHandler: ((details: { url: string }) => { action: 'deny' | 'allow'; createWindow?: (features: Record<string, unknown>) => unknown }) | undefined;
    const session = { id: 'profile-session' };
    const popupContents = { setWindowOpenHandler: vi.fn() };
    const popup = { webContents: popupContents };
    const BrowserWindowConstructor = vi.fn().mockReturnValue(popup);
    const contents = {
      session,
      setWindowOpenHandler: (handler: typeof openHandler) => { openHandler = handler; }
    } as never;

    installWindowOpenBridge(contents, () => null, {} as never, BrowserWindowConstructor as never);
    const result = openHandler?.({ url: 'https://accounts.google.com/signin/v2/identifier' });
    const created = result?.createWindow?.({ width: 400, height: 500, webPreferences: { nodeIntegration: true, preload: 'bad.js' } });

    expect(created).toBe(popupContents);
    expect(BrowserWindowConstructor).toHaveBeenCalledWith(expect.objectContaining({
      width: 400,
      height: 500,
      webPreferences: expect.objectContaining({
        session,
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        webviewTag: false
      })
    }));
    expect(popupContents.setWindowOpenHandler).toHaveBeenCalledOnce();
  });

  it('validates explicit context-menu system launches and permits only HTTP(S)/mailto', async () => {
    const shellOpenExternal = vi.fn(async () => {});
    const shell = { openExternal: shellOpenExternal } as never;

    for (const url of ['file:///C:/Users/test/secret.txt', 'javascript:alert(1)', 'intent://open/#Intent;scheme=foo;end']) {
      await expect(openContextMenuExternalUrl(url, shell)).resolves.toBe(false);
    }
    expect(shellOpenExternal).not.toHaveBeenCalled();

    await expect(openContextMenuExternalUrl('https://example.com/path', shell)).resolves.toBe(true);
    await expect(openContextMenuExternalUrl('http://example.com/path', shell)).resolves.toBe(true);
    await expect(openContextMenuExternalUrl('mailto:test@example.com', shell)).resolves.toBe(true);
    expect(shellOpenExternal).toHaveBeenNthCalledWith(1, 'https://example.com/path');
    expect(shellOpenExternal).toHaveBeenNthCalledWith(2, 'http://example.com/path');
    expect(shellOpenExternal).toHaveBeenNthCalledWith(3, 'mailto:test@example.com');
  });

  it('builds link actions that open links in Lastbrowser tabs', () => {
    const openLinkInNewTab = vi.fn();
    const copyText = vi.fn();
    const template = buildBrowserContextMenuTemplate({
      linkURL: 'https://example.com/docs',
      pageURL: 'https://example.com',
      selectionText: '',
      isEditable: false,
      editFlags: {}
    }, {
      canGoBack: true,
      canGoForward: false,
      openLinkInNewTab,
      copyText
    });

    expect(browserOpenTabChannel).toBe('lastbrowser:browser:openTab');
    expect(template.map((item) => item.label)).toContain('Open link in new tab');
    template.find((item) => item.label === 'Open link in new tab')?.click?.({} as never, {} as never, {} as never);
    template.find((item) => item.label === 'Copy link address')?.click?.({} as never, {} as never, {} as never);
    expect(openLinkInNewTab).toHaveBeenCalledWith('https://example.com/docs');
    expect(copyText).toHaveBeenCalledWith('https://example.com/docs');
  });

  it('exposes normal browser navigation and edit actions', () => {
    const template = buildBrowserContextMenuTemplate({
      linkURL: '',
      pageURL: 'https://example.com',
      selectionText: 'Example Domain',
      isEditable: true,
      editFlags: { canCopy: true, canPaste: true, canSelectAll: true }
    }, {
      canGoBack: false,
      canGoForward: true,
      openLinkInNewTab: vi.fn(),
      copyText: vi.fn()
    });

    expect(template.map((item) => item.label ?? item.role)).toEqual(expect.arrayContaining([
      'Back',
      'Forward',
      'Reload',
      'copy',
      'paste',
      'selectAll'
    ]));
  });

  it('supports deep research, private tabs, and element inspection', () => {
    const deepResearch = vi.fn();
    const openLinkInIncognitoTab = vi.fn();
    const inspect = vi.fn();

    // 1. Text selection on page
    const textTemplate = buildBrowserContextMenuTemplate({
      linkURL: '',
      pageURL: 'https://example.com/quantum',
      selectionText: 'Quantum computing superposition',
      isEditable: false,
      editFlags: {},
      x: 120,
      y: 340
    }, {
      canGoBack: false,
      canGoForward: false,
      openLinkInNewTab: vi.fn(),
      copyText: vi.fn(),
      deepResearch,
      inspect,
      assistantName: 'Astra'
    });

    const researchItem = textTemplate.find((item) => item.label?.includes('Deep Research mit Astra'));
    expect(researchItem).toBeDefined();
    researchItem?.click?.({} as never, {} as never, {} as never);
    expect(deepResearch).toHaveBeenCalledWith({
      selectionText: 'Quantum computing superposition',
      pageUrl: 'https://example.com/quantum'
    });

    const inspectItem = textTemplate.find((item) => item.label?.includes('Element untersuchen'));
    expect(inspectItem).toBeDefined();
    inspectItem?.click?.({} as never, {} as never, {} as never);
    expect(inspect).toHaveBeenCalledWith(120, 340);

    // 2. Link right-click
    const linkTemplate = buildBrowserContextMenuTemplate({
      linkURL: 'https://example.com/login',
      pageURL: 'https://example.com',
      selectionText: '',
      isEditable: false,
      editFlags: {}
    }, {
      canGoBack: false,
      canGoForward: false,
      openLinkInNewTab: vi.fn(),
      openLinkInIncognitoTab,
      copyText: vi.fn(),
      assistantName: 'Nova'
    });

    expect(linkTemplate.map((item) => item.label)).toContain('Open link in new private tab');
    linkTemplate.find((item) => item.label === 'Open link in new private tab')?.click?.({} as never, {} as never, {} as never);
    expect(openLinkInIncognitoTab).toHaveBeenCalledWith('https://example.com/login');
  });

  it('renders localized context menus based on specified locale', () => {
    // German (de)
    const deTemplate = buildBrowserContextMenuTemplate({
      linkURL: 'https://example.com/docs',
      pageURL: 'https://example.com',
      selectionText: '',
      isEditable: false,
      editFlags: {},
      x: 10,
      y: 20
    }, {
      canGoBack: true,
      canGoForward: false,
      openLinkInNewTab: vi.fn(),
      copyText: vi.fn(),
      locale: 'de'
    });
    expect(deTemplate.map((item) => item.label)).toContain('Link in neuem Tab öffnen');
    expect(deTemplate.map((item) => item.label)).toContain('Link-Adresse kopieren');
    expect(deTemplate.map((item) => item.label)).toContain('Zurück');
    expect(deTemplate.map((item) => item.label)).toContain('Element untersuchen');

    // Spanish (es)
    const esTemplate = buildBrowserContextMenuTemplate({
      linkURL: 'https://example.com/docs',
      pageURL: 'https://example.com',
      selectionText: '',
      isEditable: false,
      editFlags: {},
      x: 10,
      y: 20
    }, {
      canGoBack: true,
      canGoForward: false,
      openLinkInNewTab: vi.fn(),
      copyText: vi.fn(),
      locale: 'es'
    });
    expect(esTemplate.map((item) => item.label)).toContain('Abrir enlace en nueva pestaña');
    expect(esTemplate.map((item) => item.label)).toContain('Copiar dirección del enlace');
    expect(esTemplate.map((item) => item.label)).toContain('Atrás');
    expect(esTemplate.map((item) => item.label)).toContain('Inspeccionar elemento');

    // French (fr)
    const frTemplate = buildBrowserContextMenuTemplate({
      linkURL: 'https://example.com/docs',
      pageURL: 'https://example.com',
      selectionText: '',
      isEditable: false,
      editFlags: {}
    }, {
      canGoBack: true,
      canGoForward: false,
      openLinkInNewTab: vi.fn(),
      copyText: vi.fn(),
      locale: 'fr'
    });
    expect(frTemplate.map((item) => item.label)).toContain('Ouvrir le lien dans un nouvel onglet');
    expect(frTemplate.map((item) => item.label)).toContain('Copier l’adresse du lien');
    expect(frTemplate.map((item) => item.label)).toContain('Retour');

    // Portuguese (pt-BR)
    const ptTemplate = buildBrowserContextMenuTemplate({
      linkURL: 'https://example.com/docs',
      pageURL: 'https://example.com',
      selectionText: '',
      isEditable: false,
      editFlags: {}
    }, {
      canGoBack: true,
      canGoForward: false,
      openLinkInNewTab: vi.fn(),
      copyText: vi.fn(),
      locale: 'pt-BR'
    });
    expect(ptTemplate.map((item) => item.label)).toContain('Abrir link em nova aba');
    expect(ptTemplate.map((item) => item.label)).toContain('Copiar endereço do link');
    expect(ptTemplate.map((item) => item.label)).toContain('Voltar');

    // Russian (including regional BCP-47 locale tags)
    const ruTemplate = buildBrowserContextMenuTemplate({
      linkURL: 'https://example.com/docs',
      pageURL: 'https://example.com',
      selectionText: '',
      isEditable: false,
      editFlags: {}
    }, {
      canGoBack: true,
      canGoForward: false,
      openLinkInNewTab: vi.fn(),
      copyText: vi.fn(),
      locale: 'ru-RU'
    });
    expect(ruTemplate.map((item) => item.label)).toContain('Открыть ссылку в новой вкладке');
    expect(ruTemplate.map((item) => item.label)).toContain('Копировать адрес ссылки');
    expect(ruTemplate.map((item) => item.label)).toContain('Назад');
  });
});
