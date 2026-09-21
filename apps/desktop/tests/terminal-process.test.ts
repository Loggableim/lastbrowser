import { describe, expect, it, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';

// Mock node-pty
vi.mock('node-pty', () => {
  return {
    spawn: vi.fn((file: string, args: string[], options: Record<string, unknown>) => {
      const emitter = new EventEmitter() as any;
      emitter.file = file;
      emitter.args = args;
      emitter.options = options;
      emitter.onData = (cb: (data: string) => void) => emitter.on('data', cb);
      emitter.onExit = (cb: (exit: { exitCode: number }) => void) => emitter.on('exit', cb);
      emitter.write = vi.fn((data: string) => emitter.emit('data', data));
      emitter.resize = vi.fn((cols: number, rows: number) => {
        emitter.cols = cols;
        emitter.rows = rows;
      });
      emitter.kill = vi.fn(() => emitter.emit('exit', { exitCode: 0 }));
      return emitter;
    })
  };
});

import {
  startTerminal,
  writeTerminal,
  resizeTerminal,
  closeTerminal,
  getTerminalIds,
  type TerminalOptions
} from '../src/main/terminal-process.js';
import * as nodePty from 'node-pty';

describe('terminal-process', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Clean up any remaining terminals
    for (const id of getTerminalIds()) {
      closeTerminal(id);
    }
  });

  it('starts a shell terminal session with default options and injected CLI alias', () => {
    const onData = vi.fn();
    const result = startTerminal('C:\\workspace', onData, {
      pythonExe: 'C:\\Python\\python.exe',
      sidekickDir: 'C:\\sidekick'
    });

    expect(result.id).toMatch(/^term-/);
    expect(result.error).toBeUndefined();
    expect(nodePty.spawn).toHaveBeenCalledTimes(1);

    const call = vi.mocked(nodePty.spawn).mock.calls[0];
    const [file, args, options] = call;

    expect(file).toBeDefined();
    // PowerShell should receive the alias script command
    if (file.toLowerCase().includes('powershell') || file.toLowerCase().includes('pwsh')) {
      expect(args).toContain('-NoExit');
      expect(args.join(' ')).toContain('function global:sidekick');
    }

    expect(options.cwd).toBe('C:\\workspace');
    expect(options.env.LASTBROWSER_PYTHON_EXE).toBe('C:\\Python\\python.exe');
    expect(options.env.LASTBROWSER_SIDEKICK_DIR).toBe('C:\\sidekick');
  });

  it('starts an interactive Sidekick TUI terminal when mode is tui', () => {
    const onData = vi.fn();
    const result = startTerminal('C:\\workspace', onData, {
      mode: 'tui',
      pythonExe: 'C:\\Python\\python.exe',
      sidekickDir: 'C:\\sidekick'
    });

    expect(result.id).toMatch(/^term-/);
    expect(nodePty.spawn).toHaveBeenCalledTimes(1);

    const call = vi.mocked(nodePty.spawn).mock.calls[0];
    const [file, args, options] = call;

    expect(file).toBe('C:\\Python\\python.exe');
    expect(args).toEqual(['-m', 'sidekick_cli.main', '--tui']);
    expect(options.env.LASTBROWSER_PYTHON_EXE).toBe('C:\\Python\\python.exe');
  });

  it('writes data and receives output from terminal', () => {
    const onData = vi.fn();
    const { id } = startTerminal('C:\\workspace', onData);

    const writeRes = writeTerminal(id, 'sidekick doctor\r\n');
    expect(writeRes.ok).toBe(true);
    expect(onData).toHaveBeenCalledWith(id, 'sidekick doctor\r\n');
  });

  it('resizes terminal within safe column and row bounds', () => {
    const onData = vi.fn();
    const { id } = startTerminal('C:\\workspace', onData);

    const res = resizeTerminal(id, 140, 45);
    expect(res.ok).toBe(true);

    // Negative / excessive bounds get clamped safely
    const clampRes = resizeTerminal(id, 2, 9999);
    expect(clampRes.ok).toBe(true);
  });

  it('closes a terminal session cleanly', () => {
    const onData = vi.fn();
    const { id } = startTerminal('C:\\workspace', onData);

    expect(getTerminalIds()).toContain(id);

    const closeRes = closeTerminal(id);
    expect(closeRes.ok).toBe(true);
    expect(getTerminalIds()).not.toContain(id);
  });
});
