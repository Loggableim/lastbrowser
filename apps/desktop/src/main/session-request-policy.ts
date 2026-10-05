import type { Session } from 'electron';

type RequestDetails = Record<string, any> & { url: string; webContentsId?: number };
type Handler = (details: RequestDetails, callback: (response: Record<string, any>) => void) => void;
type Filter = { urls?: string[] } | undefined;
export type RequestPolicy = (details: RequestDetails) => { owned: boolean; allowed: boolean };
const installed = new WeakSet<Session>();

function matches(filter: Filter, url: string): boolean {
  if (!filter?.urls?.length) return true;
  return filter.urls.some(pattern => {
    if (pattern === '<all_urls>') return true;
    const regex = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
    try { return new RegExp(`^${regex}$`).test(url); } catch { return false; }
  });
}

/** Electron retains one listener/event. Compose UA, headers, Ghostery and target policy without losing any. */
export function installSessionRequestPolicy(target: Session, policy: RequestPolicy): void {
  if (installed.has(target)) return;
  installed.add(target);
  const webRequest = target.webRequest as any;
  for (const event of ['onBeforeRequest', 'onBeforeSendHeaders', 'onHeadersReceived'] as const) {
    const nativeRegister = webRequest[event].bind(webRequest);
    const consumers: { filter: Filter; handler: Handler }[] = [];
    const dispatch: Handler = (initial, callback) => {
      let decision: { owned: boolean; allowed: boolean };
      try { decision = policy(initial); } catch { callback({ cancel: true }); return; }
      if (decision.owned && !decision.allowed) { callback({ cancel: true }); return; }
      const handlers = consumers.filter(entry => matches(entry.filter, initial.url));
      const details = { ...initial };
      let accumulated: Record<string, any> = {};
      let done = false;
      const finish = (response: Record<string, any>): void => { if (!done) { done = true; clearTimeout(deadline); callback(response); } };
      const deadline = setTimeout(() => finish({ cancel: true }), 5000);
      const next = (index: number): void => {
        // Recheck when an async adblock/header handler returns: revoke may have closed the target gate.
        try { const current = policy(details); if (current.owned && !current.allowed) { finish({ cancel: true }); return; } }
        catch { finish({ cancel: true }); return; }
        if (index >= handlers.length) { finish(accumulated); return; }
        let called = false;
        try {
          handlers[index].handler(details, response => {
            if (called || done) return; called = true;
            try {
              const result = response ?? {};
              if (result.cancel) { finish({ ...accumulated, ...result, cancel: true }); return; }
              if (result.redirectURL) {
                const redirect = policy({ ...details, url: result.redirectURL });
                if (redirect.owned && !redirect.allowed) { finish({ cancel: true }); return; }
              }
              accumulated = { ...accumulated, ...result };
              if (result.requestHeaders) details.requestHeaders = result.requestHeaders;
              if (result.responseHeaders) details.responseHeaders = result.responseHeaders;
              next(index + 1);
            } catch { finish({ cancel: true }); }
          });
        } catch { finish({ cancel: true }); }
      };
      next(0);
    };
    // Intercept subsequent registrations, including Ghostery enable/disable, before any user navigation.
    webRequest[event] = (filterOrListener: Filter | Handler | null, listener?: Handler | null): void => {
      const handler = typeof filterOrListener === 'function' ? filterOrListener : listener;
      const filter = typeof filterOrListener === 'function' ? undefined : filterOrListener ?? undefined;
      if (filterOrListener === null || handler === null) consumers.pop();
      else if (handler) {
        const existing = consumers.findIndex(entry => entry.handler === handler);
        if (existing >= 0) consumers.splice(existing, 1);
        consumers.push({ filter: filter as Filter, handler });
      }
      nativeRegister({ urls: ['<all_urls>'] }, dispatch);
    };
    nativeRegister({ urls: ['<all_urls>'] }, dispatch);
  }
}
