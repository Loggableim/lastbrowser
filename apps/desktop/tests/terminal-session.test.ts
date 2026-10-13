import { describe, expect, it } from 'vitest';
import {
  reconcileStoredTerminal,
  terminalPanelPhase,
  terminalPlatformFromUserAgent,
  terminalShellCopy,
  terminalStartupLine
} from '../src/renderer/terminal-session.js';

describe('reconcileStoredTerminal', () => {
  it('keeps an id the main process still owns', () => {
    expect(reconcileStoredTerminal('term-live', ['term-live', 'term-other'])).toBe('term-live');
  });

  it('drops an id from a previous launch', () => {
    expect(reconcileStoredTerminal('term-stale', [])).toBe('');
    expect(reconcileStoredTerminal('term-stale', ['term-other'])).toBe('');
  });

  it('keeps an empty id empty', () => {
    expect(reconcileStoredTerminal('', ['term-live'])).toBe('');
  });
});

describe('terminal panel phase', () => {
  it('waits to confirm a stored id before showing a session', () => {
    expect(terminalPanelPhase('term-old', null)).toBe('pending');
    expect(terminalPanelPhase('', null)).toBe('form');
  });

  it('opens the start form when the stored id is gone', () => {
    expect(terminalPanelPhase('term-old', [])).toBe('form');
  });

  it('opens the session only when the stored id is still live', () => {
    expect(terminalPanelPhase('term-old', ['term-old'])).toBe('session');
  });
});

describe('terminal startup line', () => {
  it('shows the startup line only while a new session has no output', () => {
    expect(terminalStartupLine(true, 0)).toBe('Starting terminal session...');
    expect(terminalStartupLine(false, 0)).toBe('');
    expect(terminalStartupLine(true, 1)).toBe('');
  });
});

describe('terminal shell copy', () => {
  it('keeps PowerShell wording on Windows', () => {
    expect(terminalPlatformFromUserAgent('Mozilla/5.0 (Windows NT 10.0)')).toBe('win32');
    const copy = terminalShellCopy('win32');
    expect(copy.sessionLabel).toBe('PowerShell');
    expect(copy.shellButton).toContain('PowerShell');
    expect(copy.cwdPlaceholder).toContain('C:\\');
  });

  it('does not call the Linux shell PowerShell', () => {
    expect(terminalPlatformFromUserAgent('Mozilla/5.0 (X11; Linux x86_64)')).toBe('linux');
    const copy = terminalShellCopy('linux');
    expect(copy.sessionLabel).toBe('Shell');
    expect(copy.shellButton).toBe('Shell');
    expect(copy.headerDetail).not.toContain('ConPTY');
    expect(copy.shellHint).not.toContain('ConPTY');
    expect(copy.cwdPlaceholder.startsWith('/')).toBe(true);
    expect(JSON.stringify(copy)).not.toContain('PowerShell');
  });
});
