import { describe, expect, it } from 'vitest';
import {
  BROWSER_DIAGNOSTICS_MAX_EVENTS,
  clearBrowserDiagnostics,
  exportBrowserDiagnostics,
  flushBrowserDiagnostics,
  queryBrowserDiagnostics,
  summarizeBrowserDiagnostics,
  isBrowserDiagnosticsEnabled,
  readBrowserDiagnostics,
  recordBrowserDiagnostic,
  setBrowserDiagnosticsEnabled
} from '../src/renderer/browser-diagnostics.js';

function createStorage(): Storage {
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

describe('private browser diagnostics', () => {
  it('stays disabled by default and records nothing until explicitly enabled', () => {
    const storage = createStorage();
    expect(isBrowserDiagnosticsEnabled(storage)).toBe(false);
    expect(recordBrowserDiagnostic('mount', { tabId: 'tab-123' }, storage, 100)).toBeNull();
    setBrowserDiagnosticsEnabled(true, storage);
    expect(isBrowserDiagnosticsEnabled(storage)).toBe(true);
    expect(recordBrowserDiagnostic('mount', { tabId: 'tab-123' }, storage, 101)?.at).toBe(101);
  });

  it('bounds the local ring buffer and sanitizes identifiers, fields, and sensitive strings', () => {
    const storage = createStorage();
    setBrowserDiagnosticsEnabled(true, storage);
    for (let index = 0; index < BROWSER_DIAGNOSTICS_MAX_EVENTS + 5; index += 1) {
      recordBrowserDiagnostic('did-fail-load', {
        tabId: 'tab-123', errorCode: -105,
        errorDescription: 'https://private.example/path?token=secret',
        prompt: 'private prompt', arbitrary: 'sensitive'
      }, storage, index);
    }
    const events = readBrowserDiagnostics(storage);
    expect(events).toHaveLength(BROWSER_DIAGNOSTICS_MAX_EVENTS);
    expect(events[0].sequence).toBe(6);
    expect(events.at(-1)?.fields).toEqual({ tabId: 'tab-123', errorCode: -105 });
    expect(exportBrowserDiagnostics(storage)).not.toContain('private.example');
    expect(exportBrowserDiagnostics(storage)).not.toContain('private prompt');
  });

  it('ignores unknown event types and can clear or disable the recorder', () => {
    const storage = createStorage();
    setBrowserDiagnosticsEnabled(true, storage);
    expect(recordBrowserDiagnostic('user-content', { tabId: 'tab-1' }, storage)).toBeNull();
    recordBrowserDiagnostic('shell-context', { panel: 'browser', viewportWidth: 1200 }, storage);
    clearBrowserDiagnostics(storage);
    expect(readBrowserDiagnostics(storage)).toEqual([]);
    setBrowserDiagnosticsEnabled(false, storage);
    expect(isBrowserDiagnosticsEnabled(storage)).toBe(false);
  });

  it('supports cursors and summarizes navigation without retaining page or chat content', () => {
    const storage = createStorage();
    setBrowserDiagnosticsEnabled(true, storage);
    recordBrowserDiagnostic('mount', { tabId: 'tab-1' }, storage, 100);
    recordBrowserDiagnostic('did-start-navigation', { tabId: 'tab-1', isMainFrame: true }, storage, 110);
    recordBrowserDiagnostic('chat-event', { eventType: 'delta', streaming: true, prompt: 'private', streamId: 'private', sessionId: 'private' }, storage, 120);
    expect(queryBrowserDiagnostics({ afterSequence: 1, tabId: 'tab-1' }, storage)).toHaveLength(1);
    expect(summarizeBrowserDiagnostics(storage).tabs['tab-1']).toEqual({ mounts: 1, navigations: 1, failures: 0 });
    expect(readBrowserDiagnostics(storage).at(-1)?.fields).toEqual({ eventType: 'delta', streaming: true });
    const read = readBrowserDiagnostics(storage);
    read[0].fields.tabId = 'tampered';
    expect(readBrowserDiagnostics(storage)[0].fields.tabId).toBe('tab-1');
  });

  it('batches persistence and flushes on disable without resurrecting cleared data', () => {
    const storage = createStorage();
    setBrowserDiagnosticsEnabled(true, storage);
    recordBrowserDiagnostic('console-message', { level: 99 }, storage);
    expect(readBrowserDiagnostics(storage)[0].fields).toEqual({});
    expect(storage.getItem('__lastbrowser_browser_diagnostics_events')).toBeNull();
    setBrowserDiagnosticsEnabled(false, storage);
    expect(JSON.parse(storage.getItem('__lastbrowser_browser_diagnostics_events')!)).toHaveLength(1);
    clearBrowserDiagnostics(storage);
    flushBrowserDiagnostics(storage);
    expect(readBrowserDiagnostics(storage)).toEqual([]);
  });
});
