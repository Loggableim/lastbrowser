import type {
  App,
  BrowserWindow,
  Clipboard,
  ContextMenuParams,
  MenuItemConstructorOptions,
  Shell,
  WebContents
} from 'electron';
import { isOAuthUrl, openAuthConnectWindow } from './auth-window.js';

export const browserOpenTabChannel = 'lastbrowser:browser:openTab';
export const browserOpenIncognitoTabChannel = 'lastbrowser:browser:openIncognitoTab';
export const browserDeepResearchChannel = 'lastbrowser:browser:deepResearch';

export type BrowserContextMenuParams = Pick<
  ContextMenuParams,
  'linkURL' | 'pageURL' | 'selectionText' | 'isEditable' | 'editFlags'
> & Partial<Pick<ContextMenuParams, 'x' | 'y' | 'srcURL'>>;

export type BrowserContextMenuActions = {
  canGoBack: boolean;
  canGoForward: boolean;
  goBack?: () => void;
  goForward?: () => void;
  reload?: () => void;
  openLinkInNewTab: (url: string) => void;
  openLinkInIncognitoTab?: (url: string) => void;
  openExternal?: (url: string) => void;
  copyText: (text: string) => void;
  inspect?: (x: number, y: number) => void;
  deepResearch?: (payload: { selectionText?: string; pageUrl?: string }) => void;
  assistantName?: string;
  locale?: string;
};

export type ContextMenuLocale = 'en' | 'de' | 'es' | 'fr' | 'it' | 'pt-BR';

export interface ContextMenuLabels {
  deepResearchSelection: (assistant: string, text: string) => string;
  deepResearchLink: (assistant: string) => string;
  deepResearchPage: (assistant: string) => string;
  openLinkInNewTab: string;
  openLinkInIncognitoTab: string;
  openExternal: string;
  copyLink: string;
  back: string;
  forward: string;
  reload: string;
  inspect: string;
}

export const contextMenuLocales: Record<ContextMenuLocale, ContextMenuLabels> = {
  en: {
    deepResearchSelection: (assistant, text) => `Deep Research with ${assistant}: "${text}"`,
    deepResearchLink: (assistant) => `Deep Research link with ${assistant}`,
    deepResearchPage: (assistant) => `Deep Research with ${assistant}`,
    openLinkInNewTab: 'Open link in new tab',
    openLinkInIncognitoTab: 'Open link in new private tab',
    openExternal: 'Open link in system browser',
    copyLink: 'Copy link address',
    back: 'Back',
    forward: 'Forward',
    reload: 'Reload',
    inspect: 'Inspect element'
  },
  de: {
    deepResearchSelection: (assistant, text) => `Deep Research mit ${assistant}: „${text}“`,
    deepResearchLink: (assistant) => `Deep Research Link mit ${assistant}`,
    deepResearchPage: (assistant) => `Deep Research mit ${assistant}`,
    openLinkInNewTab: 'Link in neuem Tab öffnen',
    openLinkInIncognitoTab: 'Link in neuem privaten Tab öffnen',
    openExternal: 'Link im System-Browser öffnen',
    copyLink: 'Link-Adresse kopieren',
    back: 'Zurück',
    forward: 'Vorwärts',
    reload: 'Neu laden',
    inspect: 'Element untersuchen'
  },
  es: {
    deepResearchSelection: (assistant, text) => `Investigación profunda con ${assistant}: "${text}"`,
    deepResearchLink: (assistant) => `Investigación profunda de enlace con ${assistant}`,
    deepResearchPage: (assistant) => `Investigación profunda con ${assistant}`,
    openLinkInNewTab: 'Abrir enlace en nueva pestaña',
    openLinkInIncognitoTab: 'Abrir enlace en nueva pestaña privada',
    openExternal: 'Abrir enlace en el navegador del sistema',
    copyLink: 'Copiar dirección del enlace',
    back: 'Atrás',
    forward: 'Adelante',
    reload: 'Recargar',
    inspect: 'Inspeccionar elemento'
  },
  fr: {
    deepResearchSelection: (assistant, text) => `Recherche approfondie avec ${assistant} : « ${text} »`,
    deepResearchLink: (assistant) => `Recherche approfondie du lien avec ${assistant}`,
    deepResearchPage: (assistant) => `Recherche approfondie avec ${assistant}`,
    openLinkInNewTab: 'Ouvrir le lien dans un nouvel onglet',
    openLinkInIncognitoTab: 'Ouvrir le lien dans un nouvel onglet privé',
    openExternal: 'Ouvrir le lien dans le navigateur du système',
    copyLink: 'Copier l’adresse du lien',
    back: 'Retour',
    forward: 'Avancer',
    reload: 'Recharger',
    inspect: 'Inspecter l’élément'
  },
  it: {
    deepResearchSelection: (assistant, text) => `Ricerca approfondita con ${assistant}: "${text}"`,
    deepResearchLink: (assistant) => `Ricerca approfondita del link con ${assistant}`,
    deepResearchPage: (assistant) => `Ricerca approfondita con ${assistant}`,
    openLinkInNewTab: 'Apri link in nuova scheda',
    openLinkInIncognitoTab: 'Apri link in nuova scheda anonima',
    openExternal: 'Apri link nel browser di sistema',
    copyLink: 'Copia indirizzo del link',
    back: 'Indietro',
    forward: 'Avanti',
    reload: 'Ricarica',
    inspect: 'Ispeziona elemento'
  },
  'pt-BR': {
    deepResearchSelection: (assistant, text) => `Pesquisa aprofundada com ${assistant}: "${text}"`,
    deepResearchLink: (assistant) => `Pesquisa aprofundada do link com ${assistant}`,
    deepResearchPage: (assistant) => `Pesquisa aprofundada com ${assistant}`,
    openLinkInNewTab: 'Abrir link em nova aba',
    openLinkInIncognitoTab: 'Abrir link em nova aba privada',
    openExternal: 'Abrir link no navegador do sistema',
    copyLink: 'Copiar endereço do link',
    back: 'Voltar',
    forward: 'Avançar',
    reload: 'Recarregar',
    inspect: 'Inspecionar elemento'
  }
};

export function resolveContextMenuLabels(locale?: string): ContextMenuLabels {
  if (!locale) {
    return {
      deepResearchSelection: (assistant, text) => `Deep Research mit ${assistant}: „${text}“`,
      deepResearchLink: (assistant) => `Deep Research Link mit ${assistant}`,
      deepResearchPage: (assistant) => `Deep Research mit ${assistant}`,
      openLinkInNewTab: 'Open link in new tab',
      openLinkInIncognitoTab: 'Open link in new private tab',
      openExternal: 'Open link in system browser',
      copyLink: 'Copy link address',
      back: 'Back',
      forward: 'Forward',
      reload: 'Reload',
      inspect: 'Element untersuchen (Inspect)'
    };
  }
  const normalized = locale.toLowerCase().replace(/_/g, '-');
  if (normalized.startsWith('de')) return contextMenuLocales.de;
  if (normalized.startsWith('es')) return contextMenuLocales.es;
  if (normalized.startsWith('fr')) return contextMenuLocales.fr;
  if (normalized.startsWith('it')) return contextMenuLocales.it;
  if (normalized === 'pt' || normalized.startsWith('pt')) return contextMenuLocales['pt-BR'];
  return contextMenuLocales.en;
}

type MenuLike = {
  buildFromTemplate: (template: MenuItemConstructorOptions[]) => {
    popup: (options: { window?: BrowserWindow }) => void;
  };
};

export function buildBrowserContextMenuTemplate(
  params: BrowserContextMenuParams,
  actions: BrowserContextMenuActions
): MenuItemConstructorOptions[] {
  const template: MenuItemConstructorOptions[] = [];
  const assistantName = actions.assistantName?.trim() || 'Nova';
  const labels = resolveContextMenuLabels(actions.locale);
  const linkUrl = params.linkURL?.trim();

  if (params.selectionText?.trim()) {
    const raw = params.selectionText.trim();
    const shortText = raw.length > 28 ? `${raw.slice(0, 28)}…` : raw;
    template.push(
      {
        label: labels.deepResearchSelection(assistantName, shortText),
        click: () => actions.deepResearch?.({ selectionText: raw, pageUrl: params.pageURL })
      },
      { type: 'separator' }
    );
  }

  if (linkUrl) {
    template.push(
      {
        label: labels.openLinkInNewTab,
        click: () => actions.openLinkInNewTab(linkUrl)
      },
      {
        label: labels.openLinkInIncognitoTab,
        click: () => actions.openLinkInIncognitoTab?.(linkUrl)
      },
      {
        label: labels.deepResearchLink(assistantName),
        click: () => actions.deepResearch?.({ pageUrl: linkUrl })
      },
      {
        label: labels.openExternal,
        click: () => actions.openExternal?.(linkUrl)
      },
      {
        label: labels.copyLink,
        click: () => actions.copyText(linkUrl)
      },
      { type: 'separator' }
    );
  } else if (!params.selectionText?.trim() && params.pageURL) {
    template.push(
      {
        label: labels.deepResearchPage(assistantName),
        click: () => actions.deepResearch?.({ pageUrl: params.pageURL })
      },
      { type: 'separator' }
    );
  }

  template.push(
    {
      label: labels.back,
      enabled: actions.canGoBack,
      click: () => actions.goBack?.()
    },
    {
      label: labels.forward,
      enabled: actions.canGoForward,
      click: () => actions.goForward?.()
    },
    {
      label: labels.reload,
      click: () => actions.reload?.()
    },
    { type: 'separator' }
  );

  if (params.isEditable) {
    template.push(
      { role: 'cut', enabled: Boolean(params.editFlags?.canCut) },
      { role: 'copy', enabled: Boolean(params.editFlags?.canCopy) || Boolean(params.selectionText) },
      { role: 'paste', enabled: Boolean(params.editFlags?.canPaste) },
      { role: 'selectAll', enabled: Boolean(params.editFlags?.canSelectAll) }
    );
  } else {
    template.push(
      { role: 'copy', enabled: Boolean(params.selectionText) || Boolean(params.editFlags?.canCopy) },
      { role: 'selectAll', enabled: Boolean(params.editFlags?.canSelectAll) }
    );
  }

  if (typeof params.x === 'number' && typeof params.y === 'number') {
    template.push(
      { type: 'separator' },
      {
        label: labels.inspect,
        click: () => actions.inspect?.(params.x ?? 0, params.y ?? 0)
      }
    );
  }

  return template;
}

export function registerBrowserContextMenu({
  app,
  Menu,
  clipboard,
  shell,
  getWindow,
  getAssistantName,
  getLocale
}: {
  app: App;
  Menu: MenuLike;
  clipboard: Clipboard;
  shell: Shell;
  getWindow: () => BrowserWindow | null;
  getAssistantName?: () => string;
  getLocale?: () => string;
}): void {
  app.on('web-contents-created', (_event, contents) => {
    installWindowOpenBridge(contents, getWindow, shell);
    contents.on('context-menu', (_contextEvent, params) => {
      const template = buildBrowserContextMenuTemplate(params, {
        canGoBack: contents.canGoBack(),
        canGoForward: contents.canGoForward(),
        goBack: () => contents.goBack(),
        goForward: () => contents.goForward(),
        reload: () => contents.reload(),
        openLinkInNewTab: (url) => getWindow()?.webContents.send(browserOpenTabChannel, url),
        openLinkInIncognitoTab: (url) => getWindow()?.webContents.send(browserOpenIncognitoTabChannel, url),
        openExternal: (url) => void shell.openExternal(url),
        copyText: (text) => clipboard.writeText(text),
        inspect: (x, y) => {
          if (!contents.isDevToolsOpened()) {
            contents.openDevTools({ mode: 'right' });
          }
          contents.inspectElement(x, y);
        },
        deepResearch: (payload) => getWindow()?.webContents.send(browserDeepResearchChannel, payload),
        assistantName: getAssistantName?.() || 'Nova',
        locale: getLocale?.()
      });
      Menu.buildFromTemplate(template).popup({ window: getWindow() ?? undefined });
    });
  });
}

function installWindowOpenBridge(
  contents: WebContents,
  getWindow: () => BrowserWindow | null,
  shell: Shell
): void {
  contents.setWindowOpenHandler(({ url }) => {
    // OAuth / sign-in pages (e.g. Google Gemini, ChatGPT, Claude) open in a
    // dedicated Lastbrowser Connect window with clean User-Agent and auto-close.
    if (isOAuthUrl(url)) {
      openAuthConnectWindow({
        url,
        parentWindow: getWindow()
      });
      return { action: 'deny' };
    }
    if (isHttpUrl(url)) {
      getWindow()?.webContents.send(browserOpenTabChannel, url);
    } else {
      void shell.openExternal(url);
    }
    return { action: 'deny' };
  });
}

function isHttpUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}
