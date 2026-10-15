import type { ActionBarDock } from '../stores/usePanelStore.js';

export interface ActionBarCopy {
  dock: Record<ActionBarDock, string>;
  mute: string;
  unmute: string;
  muteShort: string;
  unmuteShort: string;
  drag: string;
  zoomReset: string;
  dockHeader: string;
  dockChange: (label: string) => string;
}

const germanDock: Record<ActionBarDock, string> = {
  topbar: 'Topleiste (Icon mit Ausklapp-Leiste)',
  sidebar: 'Seitenmenü (Links)',
  bottom: 'Unten (Zentriert)',
  'bottom-center': 'Unten Zentriert',
  'top-left': 'Oben Links',
  'top-center': 'Oben Zentriert',
  'top-right': 'Oben Rechts',
  free: 'Frei verschiebbar'
};

const englishDock: Record<ActionBarDock, string> = {
  topbar: 'Top bar (icon with flyout)',
  sidebar: 'Side menu (left)',
  bottom: 'Bottom (centered)',
  'bottom-center': 'Bottom centered',
  'top-left': 'Top left',
  'top-center': 'Top center',
  'top-right': 'Top right',
  free: 'Free move'
};

/** Dock labels and in-page tooltips. German stays German; every other locale uses English. */
export function actionBarCopy(locale: string): ActionBarCopy {
  if (locale.startsWith('de')) {
    return {
      dock: germanDock,
      mute: 'Tab stummschalten (Ctrl+M)',
      unmute: 'Tab entstummen (Ctrl+M)',
      muteShort: 'Tab stummschalten',
      unmuteShort: 'Tab entstummen',
      drag: 'Gedrückt halten & frei verschieben',
      zoomReset: 'Zoom auf 100% zurücksetzen (Ctrl+0)',
      dockHeader: 'Andocken an Menüs:',
      dockChange: (label) => `Andock-Position ändern (${label})`
    };
  }
  return {
    dock: englishDock,
    mute: 'Mute tab (Ctrl+M)',
    unmute: 'Unmute tab (Ctrl+M)',
    muteShort: 'Mute tab',
    unmuteShort: 'Unmute tab',
    drag: 'Hold and drag freely',
    zoomReset: 'Reset zoom to 100% (Ctrl+0)',
    dockHeader: 'Dock to menus:',
    dockChange: (label) => `Change dock position (${label})`
  };
}
