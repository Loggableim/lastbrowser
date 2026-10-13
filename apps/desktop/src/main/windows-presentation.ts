/**
 * Windows can mark a new frameless window occluded (installer, another app, a
 * VM compositor glitch) and then keep presenting the empty background color
 * after Chromium has already painted. Reloading forces a new frame; disabling
 * native occlusion tracking and nudging the bounds once content exists does
 * that without a reload.
 */
export const WINDOWS_NATIVE_OCCLUSION_FEATURE = 'CalculateNativeWinOcclusion';

type CommandLineSwitches = {
  appendSwitch(name: string, value?: string): void;
};

export type PresentationBounds = { x: number; y: number; width: number; height: number };

export type PresentationWindow = {
  isDestroyed(): boolean;
  isMaximized(): boolean;
  isFullScreen(): boolean;
  getBounds(): PresentationBounds;
  setBounds(bounds: PresentationBounds): void;
  once(event: 'ready-to-show', listener: () => void): void;
  on(event: 'focus', listener: () => void): void;
  removeListener(event: 'focus', listener: () => void): void;
};

export function appendWindowsFirstPaintSwitches(
  commandLine: CommandLineSwitches,
  platform: NodeJS.Platform = process.platform
): void {
  if (platform !== 'win32') return;
  commandLine.appendSwitch('disable-features', WINDOWS_NATIVE_OCCLUSION_FEATURE);
}

function canNudge(window: PresentationWindow): boolean {
  if (window.isDestroyed() || window.isMaximized() || window.isFullScreen()) return false;
  const bounds = window.getBounds();
  return bounds.width >= 2 && bounds.height >= 2;
}

export function installWindowsFirstPaintNudge(
  window: PresentationWindow,
  platform: NodeJS.Platform = process.platform,
  schedule?: (callback: () => void) => void
): void {
  if (platform !== 'win32') return;

  let contentReady = false;
  let inFlight = false;
  let completed = 0;

  const run = (): void => {
    if (!contentReady || inFlight || completed >= 2 || !canNudge(window)) return;
    const bounds = window.getBounds();
    inFlight = true;
    completed += 1;
    const nudged = { ...bounds, width: bounds.width - 1 };
    window.setBounds(nudged);
    const finish = (): void => {
      inFlight = false;
      if (!window.isDestroyed() && !window.isMaximized() && !window.isFullScreen()) {
        const current = window.getBounds();
        if (current.x === nudged.x && current.y === nudged.y
          && current.width === nudged.width && current.height === nudged.height) {
          window.setBounds(bounds);
        }
      }
      if (completed >= 2) window.removeListener('focus', onFocus);
    };
    if (schedule) schedule(finish);
    else setTimeout(finish, 0);
  };

  const onFocus = (): void => {
    run();
  };

  window.once('ready-to-show', () => {
    contentReady = true;
    run();
  });
  window.on('focus', onFocus);
}
