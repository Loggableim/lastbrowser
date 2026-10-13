import { describe, expect, it } from 'vitest';
import { settingsEscapeAction } from '../src/renderer/settings-dismiss.js';

const openSettings = {
  settingsOpen: true,
  commandPaletteOpen: false,
  findOpen: false,
  blockingOverlayOpen: false,
  nestedDialogOpen: false
};

describe('settingsEscapeAction', () => {
  it('leaves settings when no other layer is open', () => {
    expect(settingsEscapeAction(openSettings)).toBe('leave-settings');
  });

  it('ignores Escape when settings itself is closed', () => {
    expect(settingsEscapeAction({ ...openSettings, settingsOpen: false })).toBe('ignore');
  });

  it('ignores Escape while the command palette or find bar owns the key', () => {
    expect(settingsEscapeAction({ ...openSettings, commandPaletteOpen: true })).toBe('ignore');
    expect(settingsEscapeAction({ ...openSettings, findOpen: true })).toBe('ignore');
  });

  it('ignores Escape while another overlay is open', () => {
    expect(settingsEscapeAction({ ...openSettings, blockingOverlayOpen: true })).toBe('ignore');
  });

  it('closes a nested provider dialog before leaving settings', () => {
    expect(settingsEscapeAction({ ...openSettings, nestedDialogOpen: true })).toBe('close-nested');
    expect(settingsEscapeAction({
      ...openSettings,
      nestedDialogOpen: true,
      commandPaletteOpen: true
    })).toBe('ignore');
  });
});
