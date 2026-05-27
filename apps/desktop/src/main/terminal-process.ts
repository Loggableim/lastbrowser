import { ChildProcess, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';

export type TerminalInstance = {
  id: string;
  process: ChildProcess;
  cwd: string;
  createdAt: number;
};

const terminals = new Map<string, TerminalInstance>();
const BUFFER_SIZE = 10000; // max chars to keep per terminal

function createId(): string {
  return `term-${randomBytes(8).toString('hex')}`;
}

export function startTerminal(cwd: string, onData: (id: string, data: string) => void): { id: string; error?: string } {
  const id = createId();
  const shell = process.env.COMSPEC || 'cmd.exe';

  try {
    const child = spawn(shell, [], {
      cwd,
      env: { ...process.env },
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true
    });

    const instance: TerminalInstance = { id, process: child, cwd, createdAt: Date.now() };
    terminals.set(id, instance);

    let stdoutBuf = '';
    child.stdout!.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf-8');
      stdoutBuf += text;
      if (stdoutBuf.length > BUFFER_SIZE) {
        stdoutBuf = stdoutBuf.slice(stdoutBuf.length - BUFFER_SIZE);
      }
      onData(id, text);
    });

    child.stderr!.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf-8');
      onData(id, text);
    });

    child.on('exit', (code) => {
      onData(id, `\r\n[Process exited with code ${code}]\r\n`);
      terminals.delete(id);
    });

    child.on('error', (err) => {
      onData(id, `\r\n[Error: ${err.message}]\r\n`);
      terminals.delete(id);
    });

    return { id };
  } catch (error) {
    return { id, error: error instanceof Error ? error.message : String(error) };
  }
}

export function writeTerminal(id: string, data: string): { ok: boolean; error?: string } {
  const instance = terminals.get(id);
  if (!instance) return { ok: false, error: 'Terminal not found' };
  try {
    instance.process.stdin!.write(data);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export function resizeTerminal(id: string, cols: number, rows: number): { ok: boolean; error?: string } {
  // On Windows, child_process doesn't support resize natively.
  // We store the size for reference but can't actually resize cmd.exe
  return { ok: true };
}

export function closeTerminal(id: string): { ok: boolean; error?: string } {
  const instance = terminals.get(id);
  if (!instance) return { ok: false, error: 'Terminal not found' };
  try {
    instance.process.kill();
    terminals.delete(id);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export function getTerminalIds(): string[] {
  return Array.from(terminals.keys());
}
