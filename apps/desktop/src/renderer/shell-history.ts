export type ShellHistoryStep =
  | { kind: 'webview-back' }
  | { kind: 'webview-forward' }
  | { kind: 'show-start' }
  | { kind: 'restore-page'; url: string }
  | { kind: 'none' };

/**
 * The start page is a shell overlay, so it never becomes a webview history
 * entry. Back from the first page in a tab returns there. Forward from that
 * overlay restores the page Back just left.
 */
export function resolveShellBack(input: {
  canGoBack: boolean;
  currentUrl: string;
  startUrl: string;
}): ShellHistoryStep {
  if (!input.currentUrl || input.currentUrl === input.startUrl) return { kind: 'none' };
  if (input.canGoBack) return { kind: 'webview-back' };
  return { kind: 'show-start' };
}

export function resolveShellForward(input: {
  canGoForward: boolean;
  onStartPage: boolean;
  pendingUrl: string | null;
  startUrl: string;
}): ShellHistoryStep {
  if (input.onStartPage) {
    if (input.pendingUrl && input.pendingUrl !== input.startUrl) {
      return { kind: 'restore-page', url: input.pendingUrl };
    }
    return { kind: 'none' };
  }
  if (input.canGoForward) return { kind: 'webview-forward' };
  return { kind: 'none' };
}
