import type {
  App,
  BrowserWindow,
  Clipboard,
  ContextMenuParams,
  Dialog,
  MenuItemConstructorOptions,
  Shell,
  WebContents
} from 'electron';
import { BrowserWindow as ElectronBrowserWindow } from 'electron';
import { isOAuthUrl, openAuthConnectWindow, openExternalUrl } from './auth-window.js';

import { searchEngineById, searchUrlFor } from './search-engines.js';
import { captureHandoffTarget, createSidekickTabHandoff } from './sidekick-tab-handoff.js';

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
  searchEngineId?: string;
};

export type ContextMenuLocale = 'en' | 'de' | 'es' | 'fr' | 'it' | 'pt-BR' | 'ru';

export interface ContextMenuLabels {
  searchSelection: (engine: string) => string;
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
    searchSelection: (engine) => `Search with ${engine}`,
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
    searchSelection: (engine) => `Suche mit ${engine}`,
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
    searchSelection: (engine) => `Buscar con ${engine}`,
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
    searchSelection: (engine) => `Rechercher avec ${engine}`,
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
    searchSelection: (engine) => `Cerca con ${engine}`,
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
    searchSelection: (engine) => `Pesquisar com ${engine}`,
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
  },
  ru: {
    searchSelection: (engine) => `Поиск через ${engine}`,
    deepResearchSelection: (assistant, text) => `Глубокое исследование с ${assistant}: «${text}»`,
    deepResearchLink: (assistant) => `Исследовать ссылку с помощью ${assistant}`,
    deepResearchPage: (assistant) => `Глубокое исследование с ${assistant}`,
    openLinkInNewTab: 'Открыть ссылку в новой вкладке',
    openLinkInIncognitoTab: 'Открыть ссылку в новой приватной вкладке',
    openExternal: 'Открыть ссылку в системном браузере',
    copyLink: 'Копировать адрес ссылки',
    back: 'Назад',
    forward: 'Вперёд',
    reload: 'Перезагрузить',
    inspect: 'Исследовать элемент'
  }
};

export function resolveContextMenuLabels(locale?: string): ContextMenuLabels {
  if (!locale) {
    return {
      searchSelection: (engine) => `Search with ${engine}`,
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
  if (normalized.startsWith('ru')) return contextMenuLocales.ru;
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
        label: labels.searchSelection(searchEngineById(actions.searchEngineId || '').label),
        click: () => actions.openLinkInNewTab(searchUrlFor(raw, actions.searchEngineId))
      },
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
  dialog,
  shell,
  getWindow,
  getAssistantName,
  getLocale,
  getSearchEngineId
}: {
  app: App;
  Menu: MenuLike;
  clipboard: Clipboard;
  dialog?: Dialog;
  shell: Shell;
  getWindow: () => BrowserWindow | null;
  getAssistantName?: () => string;
  getLocale?: () => string;
  getSearchEngineId?: () => string;
}): void {
  const handoff = createSidekickTabHandoff();
  app.on('web-contents-created', (_event, contents) => {
    installWindowOpenBridge(contents, getWindow, shell);
    contents.on('dom-ready', () => {
      void contents.executeJavaScript(preserveContextMenuSelectionScript).catch(() => { /* document navigated */ });
    });
    contents.on('context-menu', async (_contextEvent, params) => {
      const target = dialog && captureHandoffTarget(contents);
      const host = target && contents.hostWebContents;
      const tabWindow = host && !host.isDestroyed() && ElectronBrowserWindow.fromWebContents(host);
      // Chromium can omit selectionText after a right-click outside the range,
      // even when the DOM selection is preserved. Read the originating document.
      if (!params.selectionText) {
        try {
          params.selectionText = await contents.executeJavaScript(readContextMenuSelectionScript);
        } catch { /* document navigated */ }
      }
      if (contents.isDestroyed()) return;
      const template = buildBrowserContextMenuTemplate(params, {
        canGoBack: contents.canGoBack(),
        canGoForward: contents.canGoForward(),
        goBack: () => contents.goBack(),
        goForward: () => contents.goForward(),
        reload: () => contents.reload(),
        openLinkInNewTab: (url) => getWindow()?.webContents.send(browserOpenTabChannel, url),
        openLinkInIncognitoTab: (url) => getWindow()?.webContents.send(browserOpenIncognitoTabChannel, url),
        openExternal: (url) => void openContextMenuExternalUrl(url, shell),
        copyText: (text) => clipboard.writeText(text),
        inspect: (x, y) => {
          if (!contents.isDevToolsOpened()) {
            contents.openDevTools({ mode: 'right' });
          }
          contents.inspectElement(x, y);
        },
        deepResearch: (payload) => getWindow()?.webContents.send(browserDeepResearchChannel, payload),
        assistantName: getAssistantName?.() || 'Nova',
        locale: getLocale?.(),
        searchEngineId: getSearchEngineId?.()
      });
      if (dialog && target && tabWindow && !tabWindow.isDestroyed()) {
        template.push({ type: 'separator' }, ...buildSidekickHandoffItems({
          clipboard, dialog, handoff, target, tabWindow, locale: getLocale?.()
        }));
      }
      Menu.buildFromTemplate(template).popup({ window: tabWindow || getWindow() || undefined });
    });
  });
}

function buildSidekickHandoffItems({ clipboard, dialog, handoff, target, tabWindow, locale }: {
  clipboard: Clipboard;
  dialog: Dialog;
  handoff: ReturnType<typeof createSidekickTabHandoff>;
  target: NonNullable<ReturnType<typeof captureHandoffTarget>>;
  tabWindow: BrowserWindow;
  locale?: string;
}): MenuItemConstructorOptions[] {
  const german = locale?.toLowerCase().startsWith('de');
  const text = (english: string, deutsch: string) => german ? deutsch : english;
  const title = text('Sidekick tab handback', 'Tab-Übergabe an Sidekick');
  const pairLabel = text('Pair this tab with Sidekick…', 'Tab mit Sidekick verbinden…');
  const returnLabel = text('Return this tab to Sidekick…', 'An Sidekick zurückgeben…');
  const confirm = async (returning: boolean) => {
    if (tabWindow.isDestroyed()) return false;
    const result = await dialog.showMessageBox(tabWindow, {
      type: 'question', title, message: returning ? returnLabel : pairLabel,
      detail: target.origin,
      buttons: [text('Cancel', 'Abbrechen'), returning ? text('Return tab', 'Tab zurückgeben') : text('Pair tab', 'Tab koppeln')],
      defaultId: 0, cancelId: 0, noLink: true
    });
    return result.response === 1;
  };
  const run = async (returning: boolean) => {
    const result = await (returning
      ? handoff.returnTab(target, () => confirm(true))
      : handoff.pair(target, clipboard.readText(), () => confirm(false)));
    if (result === 'cancelled' || tabWindow.isDestroyed()) return;
    const messages = {
      paired: text('Tab paired. You can now submit the request in Sidekick.', 'Tab gekoppelt. Du kannst die Anfrage jetzt in Sidekick senden.'),
      returned: text('Sidekick received the tab handback.', 'Sidekick hat die Tab-Übergabe erhalten.'),
      unavailable: text('Return to the paired tab and website after the page finishes loading.', 'Kehre zum gekoppelten Tab und zur Website zurück, sobald die Seite geladen ist.'),
      'invalid-invitation': text('Copy a fresh tab invitation from Sidekick settings.', 'Kopiere eine neue Tab-Einladung aus den Sidekick-Einstellungen.'),
      busy: text('A Sidekick action is already in progress for this tab.', 'Für diesen Tab läuft bereits eine Sidekick-Aktion.'),
      'no-pending': text('Sidekick has no pending approval for this tab.', 'Für diesen Tab wartet keine Freigabe in Sidekick.'),
      stale: text('The pending Sidekick approval changed or was canceled.', 'Die Sidekick-Freigabe wurde geändert oder abgebrochen.'),
      failed: text('Sidekick could not confirm the tab handoff.', 'Sidekick konnte die Tab-Übergabe nicht bestätigen.')
    };
    await dialog.showMessageBox(tabWindow, {
      type: result === 'paired' || result === 'returned' ? 'info' : 'warning', title, message: messages[result]
    });
  };
  const items = [{ label: pairLabel, click: () => void run(false).catch(() => {}) }];
  if (handoff.canReturn(target)) items.push({ label: returnLabel, click: () => void run(true).catch(() => {}) });
  return items;
}

export function installWindowOpenBridge(
  contents: WebContents,
  getWindow: () => BrowserWindow | null,
  shell: Shell,
  BrowserWindowConstructor: typeof ElectronBrowserWindow = ElectronBrowserWindow
): void {
  contents.setWindowOpenHandler(({ url }) => {
    // Google login is a web popup flow (YouTube, Gmail, etc.), not a standalone
    // OAuth connect flow. Keep Chromium's opener relationship and the source
    // tab's profile session so the site can complete sign-in and receive its
    // cookies. A detached Connect window breaks both, and Google's embedded
    // sign-in can reject that window as an unsafe user agent.
    if (isGoogleIdentityUrl(url)) {
      return {
        action: 'allow',
        createWindow: (features) => {
          const popup = new BrowserWindowConstructor({
            ...features,
            width: features.width || 520,
            height: features.height || 700,
            parent: getWindow() || undefined,
            autoHideMenuBar: true,
            title: 'Google sign-in',
            webPreferences: {
              session: contents.session,
              nodeIntegration: false,
              contextIsolation: true,
              sandbox: true,
              webviewTag: false
            }
          });
          installWindowOpenBridge(popup.webContents, getWindow, shell, BrowserWindowConstructor);
          return popup.webContents;
        }
      };
    }
    // Other OAuth pages use a dedicated Lastbrowser Connect window.
    if (isOAuthUrl(url)) {
      openAuthConnectWindow({
        url,
        parentWindow: getWindow()
      });
      return { action: 'deny' };
    }
    if (isHttpUrl(url)) {
      getWindow()?.webContents.send(browserOpenTabChannel, url);
    }
    return { action: 'deny' };
  });
}

function isGoogleIdentityUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === 'accounts.google.com'
      || host === 'consent.google.com'
      || host === 'myaccount.google.com';
  } catch {
    return false;
  }
}

/** Launch a link from the explicit context-menu action only after protocol validation. */
export function openContextMenuExternalUrl(url: string, shell: Shell): Promise<boolean> {
  return openExternalUrl(url, { shellOpenExternal: (targetUrl) => shell.openExternal(targetUrl) });
}

function isHttpUrl(url: string): boolean {
  try {
    const protocol = new URL(url).protocol;
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

/** Preserve a deliberate text selection when Windows moves the caret on right-click. */
export const preserveContextMenuSelectionScript = `(() => {
  if (window.__lastbrowserSelectionGuard) return;
  window.__lastbrowserSelectionGuard = true;
  const preserve = (event) => {
    if (event.button !== 2) return;
    const target = event.target;
    const editableSelection = (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)
      && target.selectionStart !== null && target.selectionEnd > target.selectionStart;
    if (editableSelection || !window.getSelection()?.isCollapsed) event.preventDefault();
  };
  document.addEventListener('pointerdown', preserve, true);
  document.addEventListener('mousedown', preserve, true);
  document.addEventListener('pointerup', preserve, true);
  document.addEventListener('mouseup', preserve, true);
})();`;

export const readContextMenuSelectionScript = `(() => {
  const active = document.activeElement;
  if ((active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement)
      && active.selectionStart !== null && active.selectionEnd > active.selectionStart) {
    // Never expose a selected password through search or research actions.
    if (active instanceof HTMLInputElement && active.type === 'password') return '';
    return active.value.slice(active.selectionStart, active.selectionEnd);
  }
  return window.getSelection()?.toString() || '';
})();`;
