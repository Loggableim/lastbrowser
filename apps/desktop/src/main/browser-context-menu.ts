import type {
  App,
  BrowserWindow,
  Clipboard,
  ContextMenuParams,
  MenuItemConstructorOptions,
  Shell,
  WebContents
} from 'electron';

export const browserOpenTabChannel = 'lastbrowser:browser:openTab';

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
  openExternal?: (url: string) => void;
  copyText: (text: string) => void;
  inspect?: (x: number, y: number) => void;
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
  const linkUrl = params.linkURL?.trim();

  if (linkUrl) {
    template.push(
      {
        label: 'Open link in new tab',
        click: () => actions.openLinkInNewTab(linkUrl)
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
        label: 'Inspect element',
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
  getWindow
}: {
  app: App;
  Menu: MenuLike;
  clipboard: Clipboard;
  shell: Shell;
  getWindow: () => BrowserWindow | null;
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
        openExternal: (url) => void shell.openExternal(url),
        copyText: (text) => clipboard.writeText(text),
        inspect: (x, y) => contents.inspectElement(x, y)
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
