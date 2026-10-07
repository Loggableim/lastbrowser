import { describe, expect, it, vi } from 'vitest';
import { bindWebviewReadiness, isWebviewReady } from '../src/renderer/webview-readiness.js';

describe('webview readiness binding', () => {
  it('only marks the current mounted element ready after dom-ready', () => {
    const view = new EventTarget();
    const onReadyChange = vi.fn();
    let current = true;
    const cleanup = bindWebviewReadiness(view, () => current, onReadyChange);

    expect(isWebviewReady(view)).toBe(false);
    view.dispatchEvent(new Event('dom-ready'));
    expect(isWebviewReady(view)).toBe(true);
    expect(onReadyChange.mock.calls).toEqual([[false], [true]]);

    view.dispatchEvent(new Event('did-start-loading'));
    expect(isWebviewReady(view)).toBe(false);
    expect(onReadyChange).toHaveBeenLastCalledWith(false);

    cleanup();
    cleanup();
    expect(onReadyChange.mock.calls.filter(([ready]) => ready === false)).toHaveLength(3);
  });

  it('ignores late lifecycle events from an element that is no longer bound', () => {
    const oldView = new EventTarget();
    const newView = new EventTarget();
    const onReadyChange = vi.fn();
    let currentView: EventTarget = oldView;
    const oldCleanup = bindWebviewReadiness(oldView, () => currentView === oldView, onReadyChange);
    oldView.dispatchEvent(new Event('dom-ready'));
    currentView = newView;
    oldCleanup();

    const newCleanup = bindWebviewReadiness(newView, () => currentView === newView, onReadyChange);
    oldView.dispatchEvent(new Event('dom-ready'));
    expect(isWebviewReady(oldView)).toBe(false);
    expect(isWebviewReady(newView)).toBe(false);
    expect(onReadyChange).toHaveBeenLastCalledWith(false);

    newView.dispatchEvent(new Event('dom-ready'));
    expect(isWebviewReady(newView)).toBe(true);
    currentView = oldView;
    newView.dispatchEvent(new Event('did-start-loading'));
    expect(isWebviewReady(newView)).toBe(true);
    newCleanup();
    expect(isWebviewReady(newView)).toBe(false);
  });
});
