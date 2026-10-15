export interface WebviewSrcLock {
  elementKey: string;
  shellToken: number;
  src: string;
}

export interface ResolveWebviewSrcInput {
  tabUrl: string;
  elementKey: string;
  shellToken: number;
  shellUrl: string | null;
  guestUrl: string | null;
  previous: WebviewSrcLock | null;
}

/**
 * The webview `src` attribute reloads the guest whenever it changes.
 * Guest navigations update the tab URL but must keep the attribute stable.
 * Shell navigations (address bar, back-to-start) bump shellToken and load shellUrl.
 * A new element (profile, panel, partition) adopts the current tab URL.
 */
export function resolveWebviewSrc(input: ResolveWebviewSrcInput): { src: string; lock: WebviewSrcLock } {
  const previous = input.previous;
  let src = input.tabUrl;
  if (previous && previous.elementKey === input.elementKey) {
    if (previous.shellToken !== input.shellToken) {
      src = input.shellUrl || input.tabUrl;
    } else if (input.guestUrl === input.tabUrl && input.tabUrl !== previous.src) {
      src = previous.src;
    } else if (input.tabUrl === previous.src) {
      src = previous.src;
    }
  }
  return {
    src,
    lock: {
      elementKey: input.elementKey,
      shellToken: input.shellToken,
      src
    }
  };
}
