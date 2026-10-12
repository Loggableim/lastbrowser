import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  appendWindowsFirstPaintSwitches,
  installWindowsFirstPaintNudge
} from '../src/main/windows-presentation.js';

type Bounds = { x: number; y: number; width: number; height: number };

function createWindow(initial: Bounds = { x: 10, y: 20, width: 1440, height: 920 }) {
  const listeners = new Map<string, Set<() => void>>();
  let bounds = { ...initial };
  let destroyed = false;
  let maximized = false;
  let fullScreen = false;
  const setBoundsCalls: Bounds[] = [];
  const window = {
    isDestroyed: () => destroyed,
    isMaximized: () => maximized,
    isFullScreen: () => fullScreen,
    getBounds: () => ({ ...bounds }),
    setBounds(next: Bounds) {
      bounds = { ...next };
      setBoundsCalls.push({ ...next });
    },
    once(event: string, listener: () => void) {
      const set = listeners.get(event) ?? new Set<() => void>();
      const wrapped = () => {
        set.delete(wrapped);
        listener();
      };
      set.add(wrapped);
      listeners.set(event, set);
    },
    on(event: string, listener: () => void) {
      const set = listeners.get(event) ?? new Set<() => void>();
      set.add(listener);
      listeners.set(event, set);
    },
    removeListener(event: string, listener: () => void) {
      listeners.get(event)?.delete(listener);
    },
    emit(event: string) {
      for (const listener of [...(listeners.get(event) ?? [])]) listener();
    },
    destroy() {
      destroyed = true;
    },
    maximize() {
      maximized = true;
    },
    enterFullScreen() {
      fullScreen = true;
    },
    setBoundsCalls
  };
  return window;
}

describe('windows first-paint presentation', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('disables native window occlusion on Windows before the first frame', () => {
    const switches: Array<{ name: string; value?: string }> = [];
    appendWindowsFirstPaintSwitches({
      appendSwitch(name, value) {
        switches.push({ name, value });
      }
    }, 'win32');

    expect(switches).toEqual([
      { name: 'disable-features', value: 'CalculateNativeWinOcclusion' }
    ]);
  });

  it('leaves Chromium feature flags untouched on other platforms', () => {
    const switches: string[] = [];
    appendWindowsFirstPaintSwitches({
      appendSwitch(name) {
        switches.push(name);
      }
    }, 'linux');

    expect(switches).toEqual([]);
  });

  it('nudges the compositor once content is ready and again on the next focus', () => {
    vi.useFakeTimers();
    const window = createWindow();
    installWindowsFirstPaintNudge(window, 'win32');

    window.emit('focus');
    expect(window.setBoundsCalls).toEqual([]);

    window.emit('ready-to-show');
    expect(window.setBoundsCalls).toEqual([{ x: 10, y: 20, width: 1439, height: 920 }]);

    window.emit('focus');
    expect(window.setBoundsCalls).toEqual([{ x: 10, y: 20, width: 1439, height: 920 }]);

    vi.runAllTimers();
    expect(window.getBounds()).toEqual({ x: 10, y: 20, width: 1440, height: 920 });

    window.emit('focus');
    expect(window.setBoundsCalls.map((bounds) => bounds.width)).toEqual([1439, 1440, 1439]);
    vi.runAllTimers();
    expect(window.getBounds().width).toBe(1440);
  });

  it('does not resize a maximized, fullscreen, or destroyed window', () => {
    const maximized = createWindow();
    maximized.maximize();
    installWindowsFirstPaintNudge(maximized, 'win32');
    maximized.emit('ready-to-show');
    expect(maximized.setBoundsCalls).toEqual([]);

    const fullscreen = createWindow();
    fullscreen.enterFullScreen();
    installWindowsFirstPaintNudge(fullscreen, 'win32');
    fullscreen.emit('ready-to-show');
    expect(fullscreen.setBoundsCalls).toEqual([]);

    const destroyed = createWindow();
    installWindowsFirstPaintNudge(destroyed, 'win32');
    destroyed.destroy();
    destroyed.emit('ready-to-show');
    expect(destroyed.setBoundsCalls).toEqual([]);
  });

  it('does not install a nudge outside Windows', () => {
    const window = createWindow();
    installWindowsFirstPaintNudge(window, 'darwin');
    window.emit('ready-to-show');
    window.emit('focus');
    expect(window.setBoundsCalls).toEqual([]);
  });
});
