export type DockAutoHidePosition = 'left' | 'right' | 'top' | 'bottom' | 'floating';

export interface DockAutoHideController {
  sync: (autoHide: boolean, position: DockAutoHidePosition, pointerOverDock: boolean, focusWithinDock: boolean) => void;
  pointerEnter: () => void;
  pointerLeave: (autoHide: boolean, position: DockAutoHidePosition) => void;
  focusEnter: () => void;
  focusLeave: (autoHide: boolean, position: DockAutoHidePosition, focusRemainsWithinDock: boolean) => void;
  dispose: () => void;
}

export function resolveDockOrientationForPanel(
  activePanel: string,
  position: DockAutoHidePosition,
  savedOrientation: 'horizontal' | 'vertical'
): 'horizontal' | 'vertical' {
  return activePanel === 'settings' && position === 'floating' ? 'vertical' : savedOrientation;
}

export function canDragFloatingDock(position: DockAutoHidePosition, activePanel: string): boolean {
  return position === 'floating' && activePanel !== 'settings';
}

export function createDockAutoHideController(
  setRevealed: (revealed: boolean) => void,
  schedule: typeof setTimeout = setTimeout,
  cancel: typeof clearTimeout = clearTimeout
): DockAutoHideController {
  let hideTimer: ReturnType<typeof setTimeout> | null = null;
  let pointerInside = false;
  let focusInside = false;

  const clearPendingHide = (): void => {
    if (hideTimer !== null) {
      cancel(hideTimer);
      hideTimer = null;
    }
  };

  const scheduleHide = (): void => {
    clearPendingHide();
    if (pointerInside || focusInside) return;
    hideTimer = schedule(() => {
      hideTimer = null;
      if (!pointerInside && !focusInside) setRevealed(false);
    }, 350);
  };

  return {
    sync(autoHide, position, pointerOverDock, focusWithinDock) {
      clearPendingHide();
      pointerInside = pointerOverDock;
      focusInside = focusWithinDock;
      if (!autoHide || position === 'floating' || pointerInside || focusInside) {
        setRevealed(true);
        return;
      }
      scheduleHide();
    },
    pointerEnter() {
      pointerInside = true;
      clearPendingHide();
      setRevealed(true);
    },
    pointerLeave(autoHide, position) {
      pointerInside = false;
      if (autoHide && position !== 'floating' && !focusInside) scheduleHide();
    },
    focusEnter() {
      focusInside = true;
      clearPendingHide();
      setRevealed(true);
    },
    focusLeave(autoHide, position, focusRemainsWithinDock) {
      focusInside = focusRemainsWithinDock;
      if (focusInside) {
        clearPendingHide();
        setRevealed(true);
      } else if (autoHide && position !== 'floating' && !pointerInside) {
        scheduleHide();
      }
    },
    dispose: clearPendingHide
  };
}
