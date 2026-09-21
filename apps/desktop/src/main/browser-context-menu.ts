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
};

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
  const linkUrl = params.linkURL?.trim();

  if (params.selectionText?.trim()) {
    const raw = params.selectionText.trim();
    const shortText = raw.length > 28 ? `${raw.slice(0, 28)}…` : raw;
    template.push(
      {
        label: `Deep Research mit ${assistantName}: „${shortText}“`,
        click: () => actions.deepResearch?.({ selectionText: raw, pageUrl: params.pageURL })
      },
      { type: 'separator' }
    );
  }

  if (linkUrl) {
    template.push(
      {
        label: 'Open link in new tab',
        click: () => actions.openLinkInNewTab(linkUrl)
      },
      {
        label: 'Open link in new private tab',
        click: () => actions.openLinkInIncognitoTab?.(linkUrl)
      },
      {
        label: `Deep Research Link mit ${assistantName}`,
        click: () => actions.deepResearch?.({ pageUrl: linkUrl })
      },
      {
        label: 'Open link in system browser',
        click: () => actions.openExternal?.(linkUrl)
      },
      {
        label: 'Copy link address',
        click: () => actions.copyText(linkUrl)
      },
      { type: 'separator' }
    );
  } else if (!params.selectionText?.trim() && params.pageURL) {
    template.push(
      {
        label: `Deep Research mit ${assistantName}`,
        click: () => actions.deepResearch?.({ pageUrl: params.pageURL })
      },
      { type: 'separator' }
    );
  }

  template.push(
    {
      label: 'Back',
      enabled: actions.canGoBack,
      click: () => actions.goBack?.()
    },
    {
      label: 'Forward',
      enabled: actions.canGoForward,
      click: () => actions.goForward?.()
    },
    {
      label: 'Reload',
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
        label: 'Element untersuchen (Inspect)',
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
  getAssistantName
}: {
  app: App;
  Menu: MenuLike;
  clipboard: Clipboard;
  shell: Shell;
  getWindow: () => BrowserWindow | null;
  getAssistantName?: () => string;
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
        assistantName: getAssistantName?.() || 'Nova'
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
