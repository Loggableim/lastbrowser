import { describe, expect, it, vi } from 'vitest';
import {
  browserOpenTabChannel,
  buildBrowserContextMenuTemplate
} from '../src/main/browser-context-menu.js';

describe('browser context menu', () => {
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
  });
});
