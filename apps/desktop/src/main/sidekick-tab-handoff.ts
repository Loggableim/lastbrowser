import { request } from 'node:http';
import type { WebContents } from 'electron';

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
  try {
    const url = new URL(contents.getURL());
    if ((url.protocol === 'http:' || url.protocol === 'https:') && !url.username && !url.password) {
      return { contents, session: contents.session, origin: url.origin };
    }
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
  operation: 'pair' | 'pending' | 'return',
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
    canReturn(target: HandoffTarget): boolean {
      const pairing = pairedTabs.get(target.contents);
      return Boolean(pairing && matches(target, pairing) && isCurrent(target));
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
        if (!pairing || !matches(target, pairing)) return 'unavailable';
        const pending = await readPending(pairing, signal);
        if (!pending) return 'no-pending';
        if (signal.aborted || !isCurrent(target)) return 'unavailable';
        if (!await confirm()) return 'cancelled';
        if (signal.aborted || !isCurrent(target)) return 'unavailable';
        const latest = await readPending(pairing, signal);
        if (!latest || pending.runId !== latest.runId || pending.approvalId !== latest.approvalId) return 'stale';
        if (signal.aborted || !isCurrent(target)) return 'unavailable';
        // A lost response still may have consumed the approval. Never send it again.
        pairedTabs.delete(target.contents);
        const result = await post(pairing.port, 'return', { ...pending, origin: target.origin }, signal, pairing.token);
        return result.returned === true ? 'returned' : 'failed';
      });
    }
  };
}
