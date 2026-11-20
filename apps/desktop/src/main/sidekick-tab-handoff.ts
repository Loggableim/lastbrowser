import { request } from 'node:http';
import { setTimeout as sleep } from 'node:timers/promises';
import type { WebContents } from 'electron';
import { visibleMainTextScript, visibleMainTextLimit } from './sidekick-visible-tab-text.js';

type HandoffTarget = {
  readonly contents: WebContents;
  readonly session: WebContents['session'];
  readonly origin: string;
};
type Pairing = { session: HandoffTarget['session']; origin: string; port: number; token: string };
type Confirmation = () => Promise<boolean>;
type HandoffResult = 'paired' | 'returned' | 'unavailable' | 'invalid-invitation'
  | 'busy' | 'cancelled' | 'no-pending' | 'stale' | 'failed';
type Pending = { runId: string; approvalId: string };

export function captureHandoffTarget(contents: WebContents): HandoffTarget | undefined {
  if (contents.isDestroyed() || contents.getType() !== 'webview'
    || contents.isCrashed() || contents.isLoadingMainFrame()) return;
  const origin = httpOrigin(contents.getURL());
  if (origin) return { contents, session: contents.session, origin };
}

function httpOrigin(raw: string): string | undefined {
  try {
    const url = new URL(raw);
    if ((url.protocol === 'http:' || url.protocol === 'https:') && !url.username && !url.password) return url.origin;
  } catch { /* A tab without an HTTP(S) document is ineligible. */ }
}

function matches(target: HandoffTarget, binding: { session: unknown; origin: string }): boolean {
  return target.session === binding.session && target.origin === binding.origin;
}

function isCurrent(target: HandoffTarget): boolean {
  const current = captureHandoffTarget(target.contents);
  return Boolean(current && matches(current, target));
}

function parseInvitation(text: string): { port: number; code: string } | undefined {
  const match = /^http:\/\/127\.0\.0\.1:([1-9]\d{0,4})\/lastbrowser\/v1\/#([a-f0-9]{32})$/.exec(text.trim());
  if (!match || Number(match[1]) > 65_535) return;
  return { port: Number(match[1]), code: match[2] };
}

function post(
  port: number,
  operation: 'pair' | 'pending' | 'return' | 'read' | 'result' | 'revoke',
  fields: Record<string, string>,
  tabSignal: AbortSignal,
  token?: string
): Promise<Record<string, unknown>> {
  const body = JSON.stringify({ version: 1, ...fields });
  const maxResponseBytes = 4096;
  // Node HTTP keeps these requests outside the tab's session and never follows redirects.
  return new Promise((resolve, reject) => {
    const req = request({
      hostname: '127.0.0.1',
      port,
      path: `/lastbrowser/v1/handoff/${operation}`,
      method: 'POST',
      agent: false,
      signal: AbortSignal.any([tabSignal, AbortSignal.timeout(5000)]),
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        ...(token && { Authorization: `Bearer ${token}` })
      }
    }, res => {
      res.on('error', reject);
      if (res.statusCode !== 200) {
        reject(new Error('Sidekick rejected the handoff request'));
        res.destroy();
        return;
      }
      const chunks: Buffer[] = [];
      let bytes = 0;
      res.on('data', (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > maxResponseBytes) {
          reject(new Error('Sidekick handoff response exceeded its limit'));
          res.destroy();
          return;
        }
        chunks.push(chunk);
      });
      res.on('end', () => {
        try {
          const value = JSON.parse(Buffer.concat(chunks).toString());
          if (!value || typeof value !== 'object' || Array.isArray(value)) {
            throw new Error('Invalid Sidekick handoff response');
          }
          resolve(value);
        } catch (err) { reject(err); }
      });
    });
    req.on('error', reject);
    req.end(body);
  });
}

async function readPending(pairing: Pairing, signal: AbortSignal): Promise<Pending | null> {
  const { pending } = await post(pairing.port, 'pending', {}, signal, pairing.token);
  if (pending === null) return null;
  if (pending && typeof pending === 'object' && 'runId' in pending && 'approvalId' in pending
    && typeof pending.runId === 'string' && pending.runId.length > 0
    && typeof pending.approvalId === 'string' && pending.approvalId.length > 0) {
    return { runId: pending.runId, approvalId: pending.approvalId };
  }
  throw new Error('Invalid pending Sidekick approval');
}

export function createSidekickTabHandoff() {
  const pairedTabs = new WeakMap<WebContents, Pairing>();
  const busyTabs = new WeakSet<WebContents>();
  const selectedGuests = new WeakMap<WebContents, WebContents>();
  const deselectionListeners = new WeakMap<WebContents, Set<() => void>>();
  const readLeases = new WeakMap<WebContents, () => void>();

  function isSelected(contents: WebContents): boolean {
    const host = contents.hostWebContents;
    return Boolean(host && !host.isDestroyed() && selectedGuests.get(host) === contents);
  }

  function onDeselected(contents: WebContents, listener: () => void): () => void {
    const listeners = deselectionListeners.get(contents) ?? new Set();
    listeners.add(listener);
    deselectionListeners.set(contents, listeners);
    return () => { listeners.delete(listener); };
  }

  function revokeRead(pairing: Pairing, runId: string): void {
    void post(pairing.port, 'revoke', { runId }, new AbortController().signal, pairing.token).catch(() => {});
  }

  function startReadLease(target: HandoffTarget, pairing: Pairing, runId: string): void {
    const { contents, origin } = target;
    readLeases.get(contents)?.();
    const host = contents.hostWebContents;
    const lease = new AbortController();
    const { signal } = lease;
    let generation = 0;
    let sent = false;
    const valid = () => !signal.aborted && isCurrent(target) && isSelected(contents);
    const revoke = () => {
      if (signal.aborted) return;
      lease.abort();
      cleanup();
      revokeRead(pairing, runId);
    };
    const navigation = (details: { isMainFrame: boolean; isSameDocument: boolean; url: string }) => {
      if (!details.isMainFrame) return;
      if (httpOrigin(details.url) !== origin) revoke();
      if (!details.isSameDocument) generation++;
    };
    const hostNavigation = (details: { isMainFrame: boolean; isSameDocument: boolean }) => {
      if (details.isMainFrame && !details.isSameDocument) revoke();
    };
    const offDeselected = onDeselected(contents, revoke);
    const expiry = setTimeout(revoke, 120_000).unref();
    function cleanup(): void {
      if (readLeases.get(contents) !== revoke) return;
      readLeases.delete(contents);
      clearTimeout(expiry);
      offDeselected();
      contents.off('did-start-navigation', navigation);
      contents.off('will-redirect', navigation);
      contents.off('did-redirect-navigation', navigation);
      contents.off('render-process-gone', revoke);
      contents.off('destroyed', revoke);
      host.off('did-start-navigation', hostNavigation);
      host.off('render-process-gone', revoke);
      host.off('destroyed', revoke);
    }
    readLeases.set(contents, revoke);
    contents.on('did-start-navigation', navigation);
    contents.on('will-redirect', navigation);
    contents.on('did-redirect-navigation', navigation);
    contents.once('render-process-gone', revoke);
    contents.once('destroyed', revoke);
    host.on('did-start-navigation', hostNavigation);
    host.once('render-process-gone', revoke);
    host.once('destroyed', revoke);

    void (async () => {
      let terminal = false;
      try {
        while (valid()) {
          const next = await post(pairing.port, 'read', { runId }, signal, pairing.token);
          if (next.active === false) {
            terminal = true;
            return;
          }
          if (next.active !== true || !valid()) break;
          if (next.requestId !== undefined) {
            if (sent || typeof next.requestId !== 'string' || !next.requestId || next.requestId.length > 256) break;
            sent = true;
            const document = generation;
            const frame = contents.mainFrame;
            const text: unknown = await Promise.race([
              contents.executeJavaScriptInIsolatedWorld(1102, [{ code: visibleMainTextScript(origin) }], false)
                .catch(() => ''),
              sleep(1500, '', { signal, ref: false })
            ]);
            if (!valid() || generation !== document || contents.mainFrame !== frame) break;
            await post(pairing.port, 'result', {
              runId, requestId: next.requestId,
              text: typeof text === 'string' ? text.slice(0, visibleMainTextLimit) : ''
            }, signal, pairing.token);
          }
          await sleep(500, undefined, { signal, ref: false });
        }
      } catch { /* A failed transport stops the lease. */ }
      finally {
        if (terminal) cleanup();
        else revoke();
      }
    })();
  }

  async function withCurrentTab(
    target: HandoffTarget,
    action: (signal: AbortSignal) => Promise<HandoffResult>
  ): Promise<HandoffResult> {
    const { contents } = target;
    if (busyTabs.has(contents)) return 'busy';
    if (!isCurrent(target)) return 'unavailable';
    const controller = new AbortController();
    const abort = () => controller.abort();
    const onNavigation = (details: { isMainFrame: boolean; isSameDocument: boolean }) => {
      if (details.isMainFrame && !details.isSameDocument) abort();
    };
    busyTabs.add(contents);
    contents.on('did-start-navigation', onNavigation);
    contents.once('render-process-gone', abort);
    contents.once('destroyed', abort);
    try {
      return await action(controller.signal);
    } catch {
      return controller.signal.aborted ? 'unavailable' : 'failed';
    } finally {
      contents.off('did-start-navigation', onNavigation);
      contents.off('render-process-gone', abort);
      contents.off('destroyed', abort);
      busyTabs.delete(contents);
    }
  }

  return {
    setSelectedGuest(host: WebContents, guest: WebContents | null): void {
      if (guest && (guest.isDestroyed() || guest.getType() !== 'webview' || guest.hostWebContents !== host)) return;
      const previous = selectedGuests.get(host);
      if (previous === guest) return;
      if (guest) selectedGuests.set(host, guest);
      else selectedGuests.delete(host);
      if (previous) {
        for (const notify of deselectionListeners.get(previous) ?? []) notify();
      }
    },

    canReturn(target: HandoffTarget): boolean {
      const pairing = pairedTabs.get(target.contents);
      return Boolean(pairing && matches(target, pairing) && isCurrent(target) && isSelected(target.contents));
    },

    pair(target: HandoffTarget, text: string, confirm: Confirmation): Promise<HandoffResult> {
      return withCurrentTab(target, async signal => {
        const invitation = parseInvitation(text);
        if (!invitation) return 'invalid-invitation';
        if (!await confirm()) return 'cancelled';
        if (signal.aborted || !isCurrent(target)) return 'unavailable';
        const { code, port } = invitation;
        const { session: token } = await post(port, 'pair', { code, origin: target.origin }, signal);
        if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{22,256}$/.test(token)) return 'failed';
        if (signal.aborted || !isCurrent(target)) return 'unavailable';
        pairedTabs.set(target.contents, { origin: target.origin, session: target.session, port, token });
        return 'paired';
      });
    },

    returnTab(target: HandoffTarget, confirm: Confirmation): Promise<HandoffResult> {
      return withCurrentTab(target, async signal => {
        const pairing = pairedTabs.get(target.contents);
        if (!pairing || !matches(target, pairing) || !isSelected(target.contents)) return 'unavailable';
        const selection = new AbortController();
        const returnSignal = AbortSignal.any([signal, selection.signal]);
        const offDeselected = onDeselected(target.contents, () => selection.abort());
        const valid = () => !returnSignal.aborted && isCurrent(target) && isSelected(target.contents);
        let returningRun: string | undefined;
        try {
          const pending = await readPending(pairing, returnSignal);
          if (!pending) return 'no-pending';
          if (!valid()) return 'unavailable';
          if (!await confirm()) return 'cancelled';
          if (!valid()) return 'unavailable';
          const latest = await readPending(pairing, returnSignal);
          if (!latest || pending.runId !== latest.runId || pending.approvalId !== latest.approvalId) return 'stale';
          if (!valid()) return 'unavailable';
          // The server may consume an approval before the response reaches Lastbrowser.
          pairedTabs.delete(target.contents);
          returningRun = pending.runId;
          const result = await post(pairing.port, 'return', { ...pending, origin: target.origin }, returnSignal, pairing.token);
          if (!valid()) {
            revokeRead(pairing, returningRun);
            return 'unavailable';
          }
          if (result.returned !== true) return 'failed';
          if (result.read === true) startReadLease(target, pairing, returningRun);
          return 'returned';
        } catch {
          if (returningRun) revokeRead(pairing, returningRun);
          return returnSignal.aborted ? 'unavailable' : 'failed';
        } finally { offDeselected(); }
      });
    }
  };
}
