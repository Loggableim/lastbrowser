import { describe, expect, it, vi } from 'vitest';
import { createOpenUrlLifecycle } from '../src/main/open-url-lifecycle.js';

function createFakeWindow(initial: { loading?: boolean; destroyed?: boolean } = {}) {
  let destroyed = initial.destroyed ?? false;
  let minimized = true;
  let visible = false;
  const send = vi.fn();
  const window = {
    isDestroyed: () => destroyed,
    isMinimized: () => minimized,
    isVisible: () => visible,
    restore: vi.fn(() => { minimized = false; }),
    show: vi.fn(() => { visible = true; }),
    focus: vi.fn(),
    webContents: {
      isLoading: () => initial.loading ?? false,
      send
    }
  };
  return {
    window,
    send,
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

  it('queues URLs until the main renderer subscribes and drains them when it is ready', () => {
    const fake = createFakeWindow();
    const lifecycle = createOpenUrlLifecycle({
      getMainWindow: () => fake.window,
      createMainWindow: () => fake.window,
      isAppReady: () => true
    });

    const delivered = vi.fn();
    expect(lifecycle.dispatchOpenUrl('https://example.com/queued', delivered)).toBe(true);
    expect(lifecycle.pendingCount()).toBe(1);
    expect(fake.send).not.toHaveBeenCalled();
    expect(delivered).not.toHaveBeenCalled();

    fake.send.mockImplementationOnce(() => { throw new Error('Renderer exited'); });
    lifecycle.onWindowReady(fake.window);
    expect(lifecycle.pendingCount()).toBe(1);
    expect(delivered).not.toHaveBeenCalled();
    lifecycle.onWindowReady(fake.window);
    expect(lifecycle.pendingCount()).toBe(0);
    expect(fake.send).toHaveBeenCalledWith('lastbrowser:browser:openTab', 'https://example.com/queued');
    expect(delivered).toHaveBeenCalledOnce();
  });

  it('delivers cold and warm URLs after the renderer subscribes even if resources are still loading', () => {
    const fake = createFakeWindow({ loading: true });
    const lifecycle = createOpenUrlLifecycle({
      getMainWindow: () => fake.window,
      createMainWindow: () => fake.window,
      isAppReady: () => true
    });

    lifecycle.dispatchOpenUrl('https://example.com/cold');
    expect(fake.send).not.toHaveBeenCalled();

    lifecycle.onWindowReady(fake.window);
    lifecycle.handleSecondInstance(['Lastbrowser.exe', 'https://example.com/warm']);

    expect(fake.send.mock.calls).toEqual([
      ['lastbrowser:browser:openTab', 'https://example.com/cold'],
      ['lastbrowser:browser:openTab', 'https://example.com/warm']
    ]);
    expect(lifecycle.pendingCount()).toBe(0);
  });

  it('waits for a new subscription after the main document starts navigating', () => {
    const fake = createFakeWindow();
    const lifecycle = createOpenUrlLifecycle({
      getMainWindow: () => fake.window,
      createMainWindow: () => fake.window,
      isAppReady: () => true
    });
    lifecycle.onWindowReady(fake.window);

    lifecycle.onWindowNavigating(fake.window);
    lifecycle.handleSecondInstance(['Lastbrowser.exe', 'https://example.com/during-reload']);
    expect(fake.send).not.toHaveBeenCalled();

    lifecycle.onWindowReady(fake.window);
    expect(fake.send).toHaveBeenCalledExactlyOnceWith('lastbrowser:browser:openTab', 'https://example.com/during-reload');
  });

  it('recreates and reveals a closed main window for a second-instance URL', () => {
    const closed = createFakeWindow({ destroyed: true });
    const created = createFakeWindow();
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

    lifecycle.onWindowReady(created.window);
    expect(created.send).toHaveBeenCalledWith('lastbrowser:browser:openTab', 'https://example.com/from-second-instance');
  });
});
