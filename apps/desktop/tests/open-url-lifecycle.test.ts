import { describe, expect, it, vi } from 'vitest';
import { createOpenUrlLifecycle, type OpenUrlWindow } from '../src/main/open-url-lifecycle.js';

function createFakeWindow(initial: { loading?: boolean; destroyed?: boolean } = {}) {
  let loading = initial.loading ?? false;
  let destroyed = initial.destroyed ?? false;
  let minimized = true;
  let visible = false;
  const send = vi.fn();
  const window: OpenUrlWindow = {
    isDestroyed: () => destroyed,
    isMinimized: () => minimized,
    isVisible: () => visible,
    restore: vi.fn(() => { minimized = false; }),
    show: vi.fn(() => { visible = true; }),
    focus: vi.fn(),
    webContents: {
      isLoading: () => loading,
      send
    }
  };
  return {
    window,
    send,
    setLoading(value: boolean) { loading = value; },
    setDestroyed(value: boolean) { destroyed = value; }
  };
}

describe('external URL window lifecycle', () => {
  it('prevents the macOS open-url default and dispatches once the renderer is ready', () => {
    const fake = createFakeWindow();
    const lifecycle = createOpenUrlLifecycle({
      getMainWindow: () => fake.window,
      createMainWindow: () => fake.window,
      isAppReady: () => true
    });
    lifecycle.onWindowReady(fake.window);
    const event = { preventDefault: vi.fn() };

    expect(lifecycle.handleOpenUrl(event, 'https://example.com/path')).toBe(true);
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(fake.send).toHaveBeenCalledWith('lastbrowser:browser:openTab', 'https://example.com/path');
  });

  it('queues URLs while the main renderer is loading and drains them after it is ready', () => {
    const fake = createFakeWindow({ loading: true });
    const lifecycle = createOpenUrlLifecycle({
      getMainWindow: () => fake.window,
      createMainWindow: () => fake.window,
      isAppReady: () => true
    });

    expect(lifecycle.dispatchOpenUrl('https://example.com/queued')).toBe(true);
    expect(lifecycle.pendingCount()).toBe(1);
    expect(fake.send).not.toHaveBeenCalled();

    fake.setLoading(false);
    lifecycle.onWindowReady(fake.window);
    expect(lifecycle.pendingCount()).toBe(0);
    expect(fake.send).toHaveBeenCalledWith('lastbrowser:browser:openTab', 'https://example.com/queued');
  });

  it('recreates and reveals a closed main window for a second-instance URL', () => {
    const closed = createFakeWindow({ destroyed: true });
    const created = createFakeWindow({ loading: true });
    let currentWindow: OpenUrlWindow | null = closed.window;
    const createMainWindow = vi.fn(() => {
      currentWindow = created.window;
      return created.window;
    });
    const lifecycle = createOpenUrlLifecycle({
      getMainWindow: () => currentWindow,
      createMainWindow,
      isAppReady: () => true
    });

    const url = lifecycle.handleSecondInstance(['Lastbrowser.exe', 'https://example.com/from-second-instance']);

    expect(url).toBe('https://example.com/from-second-instance');
    expect(createMainWindow).toHaveBeenCalledOnce();
    expect(created.window.restore).toHaveBeenCalledOnce();
    expect(created.window.show).toHaveBeenCalledOnce();
    expect(created.window.focus).toHaveBeenCalledOnce();
    expect(lifecycle.pendingCount()).toBe(1);
    expect(created.send).not.toHaveBeenCalled();

    created.setLoading(false);
    lifecycle.onWindowReady(created.window);
    expect(created.send).toHaveBeenCalledWith('lastbrowser:browser:openTab', 'https://example.com/from-second-instance');
  });
});
