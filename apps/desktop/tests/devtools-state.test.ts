import { describe, expect, it, vi } from 'vitest';
import {
  subscribeDevToolsState,
  toggleWebviewDevTools,
  type DevToolsEventSource,
  type DevToolsToggleTarget
} from '../src/renderer/devtools-state.js';

describe('DevTools renderer state synchronization', () => {
  it('uses one state-aware handler to open and close the active webview', () => {
    let open = false;
    const view = {
      ...new EventTarget(),
      isDevToolsOpened: () => open,
      openDevTools: vi.fn(() => { open = true; }),
      closeDevTools: vi.fn(() => { open = false; })
    } as unknown as DevToolsToggleTarget;
    const onChange = vi.fn<(isOpen: boolean) => void>();

    toggleWebviewDevTools(view, onChange);
    expect(view.openDevTools).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenLastCalledWith(true);

    toggleWebviewDevTools(view, onChange);
    expect(view.closeDevTools).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenLastCalledWith(false);
  });

  it('reflects toolbar open/close events and ignores events from stale or released views', () => {
    const view = new EventTarget() as DevToolsEventSource;
    let open = false;
    view.isDevToolsOpened = () => open;
    const onChange = vi.fn<(isOpen: boolean) => void>();
    let current = true;

    const unsubscribe = subscribeDevToolsState(view, () => current, onChange);
    expect(onChange).toHaveBeenLastCalledWith(false);

    open = true;
    view.dispatchEvent(new Event('devtools-opened'));
    expect(onChange).toHaveBeenLastCalledWith(true);

    open = false;
    view.dispatchEvent(new Event('devtools-closed'));
    expect(onChange).toHaveBeenLastCalledWith(false);

    current = false;
    open = true;
    view.dispatchEvent(new Event('devtools-opened'));
    expect(onChange).toHaveBeenCalledTimes(3);

    unsubscribe();
    current = true;
    view.dispatchEvent(new Event('devtools-opened'));
    expect(onChange).toHaveBeenCalledTimes(3);
  });
});
