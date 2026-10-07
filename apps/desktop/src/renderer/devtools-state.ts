export interface DevToolsEventSource extends EventTarget {
  isDevToolsOpened(): boolean;
}

export interface DevToolsToggleTarget extends DevToolsEventSource {
  openDevTools(): void;
  closeDevTools(): void;
}

/** The one renderer-side DevTools toggle used by buttons and shortcuts. */
export function toggleWebviewDevTools(
  view: DevToolsToggleTarget | null,
  onChange: (isOpen: boolean) => void
): void {
  if (!view) return;
  try {
    if (view.isDevToolsOpened()) {
      view.closeDevTools();
      onChange(false);
    } else {
      view.openDevTools();
      onChange(true);
    }
  } catch {
    // The webview may be detaching while a toggle is dispatched.
  }
}

/** Keeps renderer controls in sync when DevTools closes itself via its own UI. */
export function subscribeDevToolsState(
  view: DevToolsEventSource,
  isCurrentView: () => boolean,
  onChange: (isOpen: boolean) => void
): () => void {
  const handleOpened = (): void => {
    if (isCurrentView()) onChange(true);
  };
  const handleClosed = (): void => {
    if (isCurrentView()) onChange(false);
  };

  view.addEventListener('devtools-opened', handleOpened);
  view.addEventListener('devtools-closed', handleClosed);

  try {
    if (isCurrentView()) onChange(view.isDevToolsOpened());
  } catch {
    // The view may be tearing down while its state is read.
  }

  return () => {
    view.removeEventListener('devtools-opened', handleOpened);
    view.removeEventListener('devtools-closed', handleClosed);
  };
}
