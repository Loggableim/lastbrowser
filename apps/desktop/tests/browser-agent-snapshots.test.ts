import { describe, expect, it } from 'vitest';
import { projectAccessibilityNodes, preflightPointer } from '../src/main/browser-agent-observe.js';
import { BrowserAgentSnapshotRegistry, elementFingerprint } from '../src/main/browser-agent-snapshots.js';
import { MainDiagnosticsSink } from '../src/main/browser-diagnostics-sink.js';
import {
  BROWSER_DIAGNOSTICS_SESSION_TTL_MS,
  attachBrowserDiagnosticsSink,
  clearBrowserDiagnostics,
  correlateQuickChatTurn,
  exportBrowserDiagnostics,
  flushBrowserDiagnostics,
  isBrowserDiagnosticsEnabled,
  queryBrowserDiagnosticsV2,
  readBrowserDiagnostics,
  recordBrowserDiagnostic,
  setBrowserDiagnosticsEnabled
} from '../src/renderer/browser-diagnostics.js';

function storage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: (key: string) => values.get(key) ?? null,
    key: (index: number) => [...values.keys()][index] ?? null,
    removeItem: (key: string) => { values.delete(key); },
    setItem: (key: string, value: string) => { values.set(key, String(value)); }
  };
}

const identity = {
  leaseId: 'lease-one',
  targetId: 'target-one',
  mainGeneration: 'main-gen',
  runnerGeneration: 'runner-gen',
  navigationEpoch: 3,
  permissionEpoch: 2,
  frameId: 'frame-main',
  documentId: 'doc-1'
};

describe('diagnostic sessions', () => {
  it('keeps monotonic time when the wall clock moves backwards and versions chat names without rewriting old events', () => {
    const box = storage();
    setBrowserDiagnosticsEnabled(true, box, 1_000);
    const first = recordBrowserDiagnostic('chat.started', {}, box, 1_000);
    const second = recordBrowserDiagnostic('chat-chat-finished', {}, box, 500);
    expect(first?.event).toBe('chat-chat-started');
    expect(first?.nameVersion).toBe(2);
    expect(second?.event).toBe('chat-chat-finished');
    expect(second?.nameVersion).toBeUndefined();
    expect(second?.mono).toBe((first?.mono ?? 0) + 1);
    expect(second?.at).toBe(500);
    expect(first?.sessionId).toMatch(/^[a-z0-9]{8,40}$/);
    const legacy = storage();
    legacy.setItem('__lastbrowser_browser_diagnostics_events', JSON.stringify([{ sequence: 4, at: 10, event: 'mount', fields: { tabId: 'tab-1' } }]));
    expect(readBrowserDiagnostics(legacy)[0]).toMatchObject({ sequence: 4, event: 'mount' });
    expect(readBrowserDiagnostics(legacy)[0].sessionId).toBeUndefined();
    clearBrowserDiagnostics(box);
  });

  it('follows one quickchat turn across phases and stops after the session lifetime', () => {
    const box = storage();
    setBrowserDiagnosticsEnabled(true, box, 0);
    recordBrowserDiagnostic('quickchat-send', { turnId: 'turn0001', phase: 'send', elapsedMs: 0, streamId: 'secret-stream' }, box, 10);
    recordBrowserDiagnostic('quickchat-accepted', { turnId: 'turn0001', phase: 'accepted', elapsedMs: 40 }, box, 50);
    recordBrowserDiagnostic('quickchat-event', { turnId: 'turn0001', phase: 'first-delta', elapsedMs: 90 }, box, 100);
    expect(correlateQuickChatTurn('turn0001', box).map(entry => entry.phase)).toEqual(['send', 'accepted', 'first-delta']);
    expect(exportBrowserDiagnostics(box)).not.toContain('secret-stream');
    expect(recordBrowserDiagnostic('mount', {}, box, BROWSER_DIAGNOSTICS_SESSION_TTL_MS + 1)).toBeNull();
    expect(isBrowserDiagnosticsEnabled(box)).toBe(false);
  });

  it('uses one main writer for two renderers and reports a missing batch', async () => {
    const left = storage();
    const right = storage();
    const accepted: unknown[] = [];
    const sink = { accept: (batch: unknown) => { accepted.push(batch); } };
    setBrowserDiagnosticsEnabled(true, left, 1);
    setBrowserDiagnosticsEnabled(true, right, 1);
    attachBrowserDiagnosticsSink(sink, left);
    attachBrowserDiagnosticsSink(sink, right);
    recordBrowserDiagnostic('mount', { tabId: 'left' }, left, 10);
    recordBrowserDiagnostic('mount', { tabId: 'right' }, right, 11);
    flushBrowserDiagnostics(left);
    flushBrowserDiagnostics(right);
    expect(left.getItem('__lastbrowser_browser_diagnostics_events')).toBeNull();
    expect(accepted).toHaveLength(2);
    const main = new MainDiagnosticsSink();
    const shells = new Set([7, 8]);
    main.start();
    main.accept(7, shells, accepted[0]);
    main.accept(9, shells, accepted[1]);
    main.accept(8, shells, { ...(accepted[1] as object), events: [{ sequence: 1, at: 11, event: 'mount', fields: { tabId: 'right' } }, { sequence: 3, at: 12, event: 'unmount', fields: {} }] });
    const report = await main.query();
    expect(report.schemaVersion).toBe(2);
    expect(report.events.some(event => event.fields.tabId === 'left')).toBe(true);
    expect(report.events.some(event => event.fields.tabId === 'right')).toBe(true);
    expect(report.missingBatches).toBe(1);
    expect(main.export().rejectedSenders).toBe(1);
    main.stop();
    main.accept(7, shells, accepted[0]);
    expect((await main.query()).events.length).toBe(report.events.length);
    const v2 = await queryBrowserDiagnosticsV2({}, left);
    expect(v2.schemaVersion).toBe(2);
    expect(Array.isArray(v2.events)).toBe(true);
  });
});

describe('snapshot registry and accessibility projection', () => {
  it('rejects a replaced button that keeps the same name and a foreign lease', () => {
    let now = 1_000;
    const registry = new BrowserAgentSnapshotRegistry({ now: () => now });
    const first = registry.observe(identity, [element(10, 'Marktplatz'), element(11, 'Marktplatz')]);
    expect(first.elements).toHaveLength(2);
    expect(first.elements[0].elementRef).not.toBe(first.elements[1].elementRef);
    const replacement = registry.observe(identity, [element(99, 'Marktplatz')]);
    const stale = registry.resolve(identity.leaseId, first.snapshotId, first.elements[0].elementRef, live(10, first.elements[0].fingerprint));
    expect(stale).toEqual({ ok: false, code: 'stale_snapshot' });
    const replaced = registry.resolve(identity.leaseId, replacement.snapshotId, replacement.elements[0].elementRef, live(99, 'different-fingerprint'));
    expect(replaced).toEqual({ ok: false, code: 'element_replaced' });
    expect(registry.resolve('lease-two', replacement.snapshotId, replacement.elements[0].elementRef, { ...live(99, replacement.elements[0].fingerprint), leaseId: 'lease-two' }).ok).toBe(false);
    now += 30_001;
    const expired = registry.resolve(identity.leaseId, replacement.snapshotId, replacement.elements[0].elementRef, live(99, replacement.elements[0].fingerprint));
    expect(expired.ok).toBe(false);
  });

  it('projects labels, drops password values, and refuses an obstructed hit', () => {
    const projected = projectAccessibilityNodes([
      { role: 'button', name: 'Marktplatz', backendNodeId: 4, rect: { x: 50, y: 80, width: 100, height: 30 } },
      { role: 'button', name: '', backendNodeId: 5, rect: { x: 10, y: 10, width: 20, height: 20 } },
      { role: 'textbox', name: 'Passwort', password: true, value: 'secret-password', backendNodeId: 6, rect: { x: 10, y: 40, width: 80, height: 20 }, readonly: true },
      { role: 'button', name: 'Aus', disabled: true, backendNodeId: 7, rect: { x: 10, y: 70, width: 40, height: 20 } },
      { role: 'button', name: 'Weg', offscreen: true, backendNodeId: 8, rect: { x: 0, y: 0, width: 10, height: 10 } },
      { role: 'closed-shadow', backendNodeId: 9, rect: { x: 0, y: 0, width: 1, height: 1 } }
    ]);
    expect(JSON.stringify(projected)).not.toContain('secret-password');
    expect(projected.unsupported).toEqual(['closed_shadow_unsupported']);
    expect(projected.elements.find(item => item.backendNodeId === 5)?.unlabeled).toBe(true);
    const button = projected.elements.find(item => item.backendNodeId === 4)!;
    expect(preflightPointer(button, 4, new Set([4]))).toEqual({ ok: true });
    expect(preflightPointer(button, 70, new Set([4]))).toEqual({ ok: false, code: 'obstructed' });
    expect(preflightPointer(projected.elements.find(item => item.backendNodeId === 6)!, 6, new Set([6]))).toEqual({ ok: false, code: 'readonly' });
    expect(preflightPointer(projected.elements.find(item => item.backendNodeId === 7)!, 7, new Set([7]))).toEqual({ ok: false, code: 'disabled' });
    expect(preflightPointer(projected.elements.find(item => item.backendNodeId === 8)!, 8, new Set([8]))).toEqual({ ok: false, code: 'not_visible' });
    const fingerprint = elementFingerprint(button);
    expect(fingerprint).toHaveLength(64);
  });
});

function element(backendNodeId: number, name: string) {
  return {
    backendNodeId, frameRef: 'main', role: 'button', name, tag: 'button', visible: true, enabled: true,
    rectCssPx: { x: 1, y: backendNodeId, width: 10, height: 10 }
  };
}

function live(backendNodeId: number, fingerprint: string) {
  return { ...identity, backendNodeId, fingerprint };
}
