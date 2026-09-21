/**
 * Terminal process management with real PTY support via node-pty.
 *
 * Replaces the previous child_process.spawn() approach that used cmd.exe
 * without a PTY, which meant interactive CLI tools (Python REPL, SSH, vim,
 * ncurses programs) did not work and resize was a no-op stub.
 *
 * node-pty allocates a real Windows ConPTY (on Windows 10 1809+), which:
 *   - Provides full ANSI/VT100 escape-code output
 *   - Supports resizing (cols × rows) at any time
 *   - Makes interactive tools like Python REPL, ipython, bash loops work
 *
 * The public API is identical to the previous implementation, so no IPC
 * handler changes in main.ts are required.
 */

import { spawn as ptySpawn, type IPty } from 'node-pty';
import { randomBytes } from 'node:crypto';
import path from 'node:path';

export type TerminalMode = 'shell' | 'tui';

export type TerminalOptions = {
  mode?: TerminalMode;
  pythonExe?: string;
  sidekickDir?: string;
  env?: Record<string, string>;
  cols?: number;
  rows?: number;
};

export type TerminalInstance = {
  id: string;
  pty: IPty;
  cwd: string;
  cols: number;
  rows: number;
  createdAt: number;
  mode: TerminalMode;
};

const terminals = new Map<string, TerminalInstance>();
const DEFAULT_COLS = 120;
const DEFAULT_ROWS = 30;

function createId(): string {
  return `term-${randomBytes(8).toString('hex')}`;
}

/**
 * Start a new terminal session.
 *
 * In 'shell' mode:
 * On Windows the shell defaults to PowerShell if available (via COMSPEC or
 * the PowerShell executable path), falling back to cmd.exe. When PowerShell
 * is launched, the `sidekick` alias function is injected so all 38+ CLI
 * subcommands (doctor, status, model, gateway, etc.) work directly.
 *
 * In 'tui' mode:
 * Spawns the Sidekick Interactive Terminal UI (`python -m sidekick_cli.main --tui`)
 * in the real ConPTY allocated by node-pty.
 */
export function startTerminal(
  cwd: string,
  onData: (id: string, data: string) => void,
  options?: TerminalOptions
): { id: string; error?: string } {
  const id = createId();
  const mode: TerminalMode = options?.mode === 'tui' ? 'tui' : 'shell';
  const cols = options?.cols ?? DEFAULT_COLS;
  const rows = options?.rows ?? DEFAULT_ROWS;

  const env: Record<string, string> = {
    ...process.env,
    ...options?.env,
    TERM: 'xterm-256color',
    COLORTERM: 'truecolor'
  };

  if (options?.pythonExe) {
    env.LASTBROWSER_PYTHON_EXE = options.pythonExe;
  }
  if (options?.sidekickDir) {
    env.LASTBROWSER_SIDEKICK_DIR = options.sidekickDir;
    const delimiter = process.platform === 'win32' ? ';' : ':';
    env.PYTHONPATH = env.PYTHONPATH
      ? `${options.sidekickDir}${delimiter}${env.PYTHONPATH}`
      : options.sidekickDir;
  }

  let file: string;
  let args: string[] = [];
  let spawnCwd = cwd || process.cwd();

  if (mode === 'tui') {
    file = options?.pythonExe || 'python';
    args = ['-m', 'sidekick_cli.main', '--tui'];
    if (options?.sidekickDir && !cwd) {
      spawnCwd = options.sidekickDir;
    }
  } else {
    file = resolveShell();
    const isPowerShell = file.toLowerCase().includes('powershell') || file.toLowerCase().includes('pwsh');
    if (isPowerShell) {
      const aliasCommands = [
        `$env:TERM = 'xterm-256color'`,
        `if ($env:LASTBROWSER_PYTHON_EXE) {`,
        `  function global:sidekick { & "$env:LASTBROWSER_PYTHON_EXE" -m sidekick_cli.main @args }`,
        `  Write-Host "Lastbrowser Terminal (Sidekick CLI ready)" -ForegroundColor Cyan`,
        `  Write-Host "Tip: Type 'sidekick --help' or 'sidekick doctor' to use CLI tools." -ForegroundColor DarkGray`,
        `}`
      ].join('; ');
      args = ['-NoExit', '-Command', aliasCommands];
    }
  }

  try {
    const ptyProcess = ptySpawn(file, args, {
      name: 'xterm-256color',
      cols,
      rows,
      cwd: spawnCwd,
      env
    });

    const instance: TerminalInstance = {
      id,
      pty: ptyProcess,
      cwd: spawnCwd,
      cols,
      rows,
      createdAt: Date.now(),
      mode
    };
    terminals.set(id, instance);

    ptyProcess.onData((data: string) => {
      onData(id, data);
    });

    ptyProcess.onExit(({ exitCode }: { exitCode: number }) => {
      onData(id, `\r\n[Process exited with code ${exitCode}]\r\n`);
      terminals.delete(id);
    });

    return { id };
  } catch (error) {
    return { id, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Send input to a running terminal.
 */
export function writeTerminal(id: string, data: string): { ok: boolean; error?: string } {
  const instance = terminals.get(id);
  if (!instance) return { ok: false, error: 'Terminal not found' };
  try {
    instance.pty.write(data);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Resize the terminal to new dimensions.
 *
 * Unlike the previous stub, this call is fully functional: node-pty passes
 * the resize to the underlying ConPTY, so the shell and running programs
 * receive SIGWINCH (Unix) or a ConPTY resize notification (Windows) and
 * reflow their output accordingly.
 */
export function resizeTerminal(id: string, cols: number, rows: number): { ok: boolean; error?: string } {
  const instance = terminals.get(id);
  if (!instance) return { ok: false, error: 'Terminal not found' };
  try {
    const safeCols = Math.max(10, Math.min(cols, 500));
    const safeRows = Math.max(2, Math.min(rows, 200));
    instance.pty.resize(safeCols, safeRows);
    instance.cols = safeCols;
    instance.rows = safeRows;
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Terminate a terminal session.
 */
export function closeTerminal(id: string): { ok: boolean; error?: string } {
  const instance = terminals.get(id);
  if (!instance) return { ok: false, error: 'Terminal not found' };
  try {
    instance.pty.kill();
    terminals.delete(id);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export function getTerminalIds(): string[] {
  return Array.from(terminals.keys());
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function resolveShell(): string {
  // Windows: prefer PowerShell 7 (pwsh), then Windows PowerShell (powershell), then cmd
  if (process.platform === 'win32') {
    // COMSPEC points to cmd.exe — we prefer pwsh if it's available
    const { execFileSync } = require('node:child_process') as typeof import('node:child_process');
    for (const candidate of ['pwsh.exe', 'powershell.exe']) {
      try {
        execFileSync('where', [candidate], { stdio: 'pipe' });
        return candidate;
      } catch {
        // Not found — try next
      }
    }
    return process.env.COMSPEC || 'cmd.exe';
  }
  // Unix: prefer $SHELL, fall back to bash then sh
  return process.env.SHELL || '/bin/bash';
}
