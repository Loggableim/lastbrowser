import { beforeEach, describe, expect, it } from 'vitest';
import { matchBrowserShortcut } from '../src/main/shortcuts.js';
import { usePanelStore } from '../src/renderer/stores/usePanelStore.js';

describe('Universal Command Palette (Phase 7.3 & 10.4)', () => {
  describe('shortcut matching', () => {
    it('matches Ctrl+K and Cmd+K to toggle-command-palette', () => {
      expect(matchBrowserShortcut({ type: 'keyDown', key: 'k', control: true })).toEqual({
        action: 'toggle-command-palette'
      });
      expect(matchBrowserShortcut({ type: 'keyDown', key: 'K', control: true })).toEqual({
        action: 'toggle-command-palette'
      });
      expect(matchBrowserShortcut({ type: 'keyDown', key: 'k', meta: true })).toEqual({
        action: 'toggle-command-palette'
      });
      expect(matchBrowserShortcut({ type: 'keyDown', key: 'K', meta: true })).toEqual({
        action: 'toggle-command-palette'
      });
    });

    it('does not trigger with Shift or Alt pressed', () => {
      expect(matchBrowserShortcut({ type: 'keyDown', key: 'k', control: true, shift: true })).toBeNull();
      expect(matchBrowserShortcut({ type: 'keyDown', key: 'k', control: true, alt: true })).toBeNull();
    });
  });

  describe('usePanelStore command palette state', () => {
    beforeEach(() => {
      usePanelStore.setState({ commandPaletteOpen: false });
    });

    it('toggles commandPaletteOpen state', () => {
      expect(usePanelStore.getState().commandPaletteOpen).toBe(false);

      usePanelStore.getState().toggleCommandPalette();
      expect(usePanelStore.getState().commandPaletteOpen).toBe(true);

      usePanelStore.getState().toggleCommandPalette();
      expect(usePanelStore.getState().commandPaletteOpen).toBe(false);
    });

    it('sets commandPaletteOpen explicitly', () => {
      usePanelStore.getState().setCommandPaletteOpen(true);
      expect(usePanelStore.getState().commandPaletteOpen).toBe(true);

      usePanelStore.getState().setCommandPaletteOpen(false);
      expect(usePanelStore.getState().commandPaletteOpen).toBe(false);

      usePanelStore.getState().setCommandPaletteOpen((prev) => !prev);
      expect(usePanelStore.getState().commandPaletteOpen).toBe(true);
    });
  });
});
