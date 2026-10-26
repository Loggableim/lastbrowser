import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';

/**
 * Recovery for a Sidekick backend that still owns the preferred port but no
 * longer answers HTTP (for example a hung process left behind by a previous
 * app session). Such a process is killed and the port is reused, instead of
 * silently moving every new start to the next free port while the orphan keeps
 * its listener. Processes that are not identifiable as Sidekick are never
 * killed.
 */

export type PortRecoveryOutcome =
  | 'free'
  | 'healthy'
  | 'recovered'
  | 'foreign'
  | 'unidentified'
  | 'failed';

export type PortRecoveryDeps = {
  platform: NodeJS.Platform | string;
  isPortAvailable(port: number): Promise<boolean>;
  checkHealth(webuiUrl: string): Promise<{ ok: boolean; error?: string }>;
  findListenerPid(port: number): Promise<number | null>;
  readCommandLine(pid: number): Promise<string | null>;
  terminate(pid: number): Promise<void>;
  waitForPortFree(port: number, timeoutMs: number): Promise<boolean>;
  log?(message: string): void;
};

/** True only for command lines that start the bundled Sidekick web backend. */
export function isSidekickBackendCommandLine(commandLine: string | null | undefined): boolean {
  const text = String(commandLine || '');
  return /cli\.supervised_web\b/.test(text) || /uvicorn\s+cli\.web_server:app\b/.test(text);
}

/**
 * Extract the PID of a process LISTENing on `port` from `netstat -ano -p tcp`
 * (Windows) or `ss -ltnp` (Linux) output. Windows listener rows are identified
 * by a foreign address ending in `:0`, which is locale independent (the state
 * column is localized).
 */
export function parseListenerPid(output: string, port: number, platform: NodeJS.Platform | string): number | null {
  const lines = String(output || '').split(/\r?\n/);
  if (platform === 'win32') {
    for (const line of lines) {
      const match = /^\s*TCP\s+(\S+):(\d+)\s+(\S+):(\d+)\s+\S+\s+(\d+)\s*$/i.exec(line);
      if (!match) continue;
      if (Number(match[2]) !== port || Number(match[4]) !== 0) continue;
      const pid = Number(match[5]);
      if (Number.isSafeInteger(pid) && pid > 0) return pid;
    }
    return null;
  }
  for (const line of lines) {
    if (!new RegExp(`:${port}\\s`).test(line)) continue;
    const match = /pid=(\d+)/.exec(line);
    if (!match) continue;
    const pid = Number(match[1]);
    if (Number.isSafeInteger(pid) && pid > 0) return pid;
  }
  return null;
}

/**
 * Decide what to do with the preferred port before a new backend starts.
 *
 * - `free`: nothing listens there; use it.
 * - `healthy`: a live Sidekick answers; do not touch it.
 * - `recovered`: a hung Sidekick backend was terminated and the port is free.
 * - `foreign`: something else listens there; never killed.
 * - `unidentified`: a listener exists but its PID could not be determined.
 * - `failed`: recovery itself failed; the caller falls back to port search.
 */
export async function recoverHungSidekickPort(
  port: number,
  deps: PortRecoveryDeps
): Promise<PortRecoveryOutcome> {
  const log = deps.log ?? (() => undefined);
  try {
    if (await deps.isPortAvailable(port)) return 'free';

    const webuiUrl = `http://127.0.0.1:${port}`;
    const health = await deps.checkHealth(webuiUrl);
    if (health.ok) return 'healthy';

    const pid = await deps.findListenerPid(port);
    if (pid === null) {
      log(`[lastbrowser] port ${port} is held but its owner could not be identified; not reusing it.`);
      return 'unidentified';
    }
    const commandLine = await deps.readCommandLine(pid);
    if (!isSidekickBackendCommandLine(commandLine)) {
      log(`[lastbrowser] port ${port} is held by pid ${pid}, which is not a Sidekick backend; leaving it alone.`);
      return 'foreign';
    }

    log(`[lastbrowser] Sidekick backend pid ${pid} holds port ${port} but does not answer /health (${health.error || 'no response'}); terminating it.`);
    await deps.terminate(pid);
    if (await deps.waitForPortFree(port, 5_000)) return 'recovered';
    return 'unidentified';
  } catch (error) {
    log(`[lastbrowser] hung Sidekick recovery failed: ${error instanceof Error ? error.message : String(error)}`);
    return 'failed';
  }
}

function runCommand(file: string, args: string[], timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(file, args, { windowsHide: true, timeout: timeoutMs, maxBuffer: 4 * 1024 * 1024 }, (error, stdout) => {
      if (error) reject(error);
      else resolve(String(stdout));
    });
  });
}

/** Real system probes used by the app; tests inject their own deps. */
export function systemPortRecoveryDeps(
  platform: NodeJS.Platform | string,
  checks: Pick<PortRecoveryDeps, 'isPortAvailable' | 'checkHealth' | 'log'>
): PortRecoveryDeps {
  return {
    platform,
    ...checks,
    async findListenerPid(port: number): Promise<number | null> {
      if (platform === 'win32') {
        return parseListenerPid(await runCommand('netstat', ['-ano', '-p', 'tcp'], 5_000), port, platform);
      }
      try {
        const pid = parseListenerPid(await runCommand('ss', ['-ltnp'], 5_000), port, platform);
        if (pid !== null) return pid;
      } catch {
        // ss is unavailable; fall through to lsof.
      }
      try {
        const first = (await runCommand('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t'], 5_000))
          .split(/\r?\n/).map((line) => Number(line.trim())).find((value) => Number.isSafeInteger(value) && value > 0);
        return first ?? null;
      } catch {
        return null;
      }
    },
    async readCommandLine(pid: number): Promise<string | null> {
      if (!Number.isSafeInteger(pid) || pid <= 0) return null;
      if (platform === 'win32') {
        try {
          const output = await runCommand('powershell.exe', [
            '-NoProfile', '-NonInteractive', '-Command',
            `(Get-CimInstance Win32_Process -Filter "ProcessId = ${pid}").CommandLine`
          ], 8_000);
          return output.trim() || null;
        } catch {
          return null;
        }
      }
      try {
        return (await readFile(`/proc/${pid}/cmdline`, 'utf8')).replace(/\0/g, ' ').trim() || null;
      } catch {
        return null;
      }
    },
    async terminate(pid: number): Promise<void> {
      if (!Number.isSafeInteger(pid) || pid <= 0) return;
      if (platform === 'win32') {
        await runCommand('taskkill', ['/F', '/T', '/PID', String(pid)], 10_000).catch(() => undefined);
        return;
      }
      try {
        process.kill(pid, 'SIGKILL');
      } catch {
        // Already gone.
      }
    },
    async waitForPortFree(port: number, timeoutMs: number): Promise<boolean> {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        if (await checks.isPortAvailable(port)) return true;
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
      return checks.isPortAvailable(port);
    }
  };
}
