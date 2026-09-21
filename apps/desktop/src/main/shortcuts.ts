export const browserShortcutChannel = 'lastbrowser:browser:shortcut';

export type BrowserShortcutAction =
  | 'new-tab'
  | 'new-incognito-tab'
  | 'close-tab'
  | 'reopen-tab'
  | 'focus-address'
  | 'reload'
  | 'reload-hard'
  | 'next-tab'
  | 'prev-tab'
  | 'jump-tab'
  | 'jump-last-tab'
  | 'find-in-page'
  | 'open-history'
  | 'open-downloads'
  | 'open-settings'
  | 'toggle-sidebar'
  | 'toggle-command-palette'
  | 'toggle-devtools'
  | 'history-back'
  | 'history-forward'
  | 'toggle-fullscreen'
  | 'print-page'
  | 'zoom-in'
  | 'zoom-out'
  | 'zoom-reset';

export interface BrowserShortcutEvent {
  action: BrowserShortcutAction;
  payload?: {
    index?: number;
  };
}

export interface InputLike {
  type: string;
  key: string;
  code?: string;
  shift?: boolean;
  control?: boolean;
  alt?: boolean;
  meta?: boolean;
  isAutoRepeat?: boolean;
}

interface WebContentsLike {
  on(event: 'before-input-event', listener: (event: { preventDefault: () => void }, input: InputLike) => void): void;
}

interface BrowserWindowLike {
  isDestroyed(): boolean;
  webContents: {
    send(channel: string, ...args: unknown[]): void;
  };
}

interface AppLike {
  on(event: 'web-contents-created', listener: (event: unknown, contents: WebContentsLike) => void): void;
}

/**
 * Pure mapping function from an input event to a browser shortcut action.
 * Returns null if the keystroke does not match any registered browser shortcut.
 */
export function matchBrowserShortcut(input: InputLike): BrowserShortcutEvent | null {
  if (input.type !== 'keyDown') {
    return null;
  }

  const hasAcc = Boolean(input.control || input.meta);
  const hasShift = Boolean(input.shift);
  const hasAlt = Boolean(input.alt);
  const key = input.key;

  // DevTools: F12 or Ctrl+Shift+I
  if (!hasAcc && !hasShift && !hasAlt && key === 'F12') {
    return { action: 'toggle-devtools' };
  }
  if (hasAcc && hasShift && !hasAlt && (key === 'i' || key === 'I')) {
    return { action: 'toggle-devtools' };
  }

  // Fullscreen: F11
  if (!hasAcc && !hasShift && !hasAlt && key === 'F11') {
    return { action: 'toggle-fullscreen' };
  }

  // F5 reload variants
  if (key === 'F5') {
    if (hasAcc || hasShift) {
      return { action: 'reload-hard' };
    }
    if (!hasAlt) {
      return { action: 'reload' };
    }
  }

  // Alt shortcuts (Alt+D for address bar, Alt+ArrowLeft for back, Alt+ArrowRight for forward)
  if (!hasAcc && !hasShift && hasAlt) {
    if (key === 'd' || key === 'D') {
      return { action: 'focus-address' };
    }
    if (key === 'ArrowLeft' || key === 'Left') {
      return { action: 'history-back' };
    }
    if (key === 'ArrowRight' || key === 'Right') {
      return { action: 'history-forward' };
    }
  }

  // All other shortcuts require Ctrl / Cmd modifier
  if (!hasAcc) {
    return null;
  }

  // Shift combinations
  if (hasShift && !hasAlt) {
    if (key === 't' || key === 'T') {
      return { action: 'reopen-tab' };
    }
    if (key === 'n' || key === 'N') {
      return { action: 'new-incognito-tab' };
    }
    if (key === 'r' || key === 'R') {
      return { action: 'reload-hard' };
    }
    if (key === 'Tab') {
      return { action: 'prev-tab' };
    }
  }

  // No-Shift combinations
  if (!hasShift && !hasAlt) {
    if (key === 't' || key === 'T') {
      return { action: 'new-tab' };
    }
    if (key === 'w' || key === 'W') {
      return { action: 'close-tab' };
    }
    if (key === 'l' || key === 'L') {
      return { action: 'focus-address' };
    }
    if (key === 'r' || key === 'R') {
      return { action: 'reload' };
    }
    if (key === 'Tab' || key === 'PageDown') {
      return { action: 'next-tab' };
    }
    if (key === 'PageUp') {
      return { action: 'prev-tab' };
    }
    if (key >= '1' && key <= '8') {
      return {
        action: 'jump-tab',
        payload: { index: parseInt(key, 10) - 1 }
      };
    }
    if (key === '9') {
      return { action: 'jump-last-tab' };
    }
    if (key === 'f' || key === 'F') {
      return { action: 'find-in-page' };
    }
    if (key === 'h' || key === 'H') {
      return { action: 'open-history' };
    }
    if (key === 'j' || key === 'J') {
      return { action: 'open-downloads' };
    }
    if (key === ',') {
      return { action: 'open-settings' };
    }
    if (key === 'b' || key === 'B') {
      return { action: 'toggle-sidebar' };
    }
    if (key === 'k' || key === 'K') {
      return { action: 'toggle-command-palette' };
    }
    if (key === 'p' || key === 'P') {
      return { action: 'print-page' };
    }
  }

  // Zoom controls (Shift can be pressed for +)
  if (!hasAlt) {
    if (key === '=' || key === '+') {
      return { action: 'zoom-in' };
    }
    if (key === '-' || key === '_') {
      return { action: 'zoom-out' };
    }
    if (key === '0') {
      return { action: 'zoom-reset' };
    }
  }

  return null;
}

/**
 * Hooks before-input-event across all WebContents in the application
 * (both mainWindow and guest <webview> elements) to break through the webview focus trap.
 */
export function registerBrowserShortcuts({
  app,
  getWindow
}: {
  app: AppLike;
  getWindow: () => BrowserWindowLike | null;
}): void {
  app.on('web-contents-created', (_event, contents) => {
    contents.on('before-input-event', (event, input) => {
      const match = matchBrowserShortcut(input);
      if (match) {
        event.preventDefault();
        const win = getWindow();
        if (win && !win.isDestroyed()) {
          win.webContents.send(browserShortcutChannel, match);
        }
      }
    });
  });
}
