export type SettingsEscapeAction = 'ignore' | 'close-nested' | 'leave-settings';

export function settingsEscapeAction(input: {
  settingsOpen: boolean;
  commandPaletteOpen: boolean;
  findOpen: boolean;
  blockingOverlayOpen?: boolean;
  nestedDialogOpen: boolean;
}): SettingsEscapeAction {
  if (!input.settingsOpen || input.commandPaletteOpen || input.findOpen || input.blockingOverlayOpen) return 'ignore';
  if (input.nestedDialogOpen) return 'close-nested';
  return 'leave-settings';
}
