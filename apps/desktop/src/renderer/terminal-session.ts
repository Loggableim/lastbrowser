/** Drop a terminal id that the main process no longer owns. */
export function reconcileStoredTerminal(storedId: string, liveIds: readonly string[]): string {
  if (!storedId) return '';
  return liveIds.includes(storedId) ? storedId : '';
}

export type TerminalPlatform = 'win32' | 'darwin' | 'linux';

export type TerminalShellCopy = {
  headerDetail: string;
  shellButton: string;
  sessionLabel: string;
  cwdPlaceholder: string;
  shellHint: string;
  openLabel: string;
};

/** A stored id stays hidden until the main process confirms the PTY is still alive. */
export function terminalPanelPhase(
  storedId: string,
  liveIds: readonly string[] | null
): 'pending' | 'form' | 'session' {
  if (liveIds === null) return storedId ? 'pending' : 'form';
  return reconcileStoredTerminal(storedId, liveIds) ? 'session' : 'form';
}

/** The startup line is only for the moment a new PTY is being spawned. */
export function terminalStartupLine(starting: boolean, lineCount: number): string {
  return starting && lineCount === 0 ? 'Starting terminal session...' : '';
}

export function terminalPlatformFromUserAgent(userAgent: string): TerminalPlatform {
  if (/Windows/i.test(userAgent)) return 'win32';
  if (/Mac OS X|Macintosh/i.test(userAgent)) return 'darwin';
  return 'linux';
}

export function terminalShellCopy(platform: TerminalPlatform): TerminalShellCopy {
  if (platform === 'win32') {
    return {
      headerDetail: 'ConPTY Terminal mit integrierten Sidekick-Befehlen und Sidekick TUI',
      shellButton: 'PowerShell Shell (CLI-Integration)',
      sessionLabel: 'PowerShell',
      cwdPlaceholder: 'C:\\path\\to\\workspace',
      shellHint: 'Startet ConPTY mit direktem Zugriff auf die Sidekick-CLI (sidekick doctor, sidekick status).',
      openLabel: 'Open Shell Terminal'
    };
  }
  return {
    headerDetail: 'Interaktive Shell mit Sidekick-Befehlen und Sidekick TUI',
    shellButton: 'Shell',
    sessionLabel: 'Shell',
    cwdPlaceholder: platform === 'darwin' ? '/Users/user/project' : '/home/user/project',
    shellHint: 'Startet eine interaktive Shell. Die Sidekick-CLI bleibt über sidekick doctor und sidekick status erreichbar.',
    openLabel: 'Shell öffnen'
  };
}
