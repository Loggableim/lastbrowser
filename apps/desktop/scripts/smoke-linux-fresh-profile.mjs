import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const HEALTH_URL = 'http://127.0.0.1:8788/health';
const STARTUP_TIMEOUT_MS = 90_000;

function requireValue(value, message) {
  if (!value) throw new Error(message);
  return value;
}

async function waitForSidekick(child, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastError = 'health endpoint has not responded';
  while (Date.now() < deadline) {
    if (child.spawnError) throw new Error(`Could not launch Lastbrowser: ${child.spawnError.message}`);
    if (child.exitCode !== null) throw new Error(`Lastbrowser exited before Sidekick became healthy (code ${child.exitCode}).`);
    try {
      const response = await fetch(HEALTH_URL, { signal: AbortSignal.timeout(1500) });
      if (response.ok) {
        const health = await response.json();
        if (health?.ok === true) return health;
        lastError = `unexpected health response: ${JSON.stringify(health)}`;
      } else {
        lastError = `health endpoint returned HTTP ${response.status}`;
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await delay(500);
  }
  throw new Error(`Sidekick did not become healthy within ${timeoutMs} ms: ${lastError}`);
}

async function main() {
  if (process.platform !== 'linux') throw new Error('This fresh-profile smoke must run on Linux.');
  if (process.arch !== 'x64') throw new Error(`Expected a Linux x64 host, received ${process.arch}.`);
  const archiveArg = process.argv[2] || process.env.LASTBROWSER_LINUX_PACKAGE;
  const archive = resolve(requireValue(archiveArg, 'Usage: npm run smoke:linux:fresh-profile -- <Lastbrowser-...tar.gz>'));
  if (!existsSync(archive)) throw new Error(`Linux package archive not found: ${archive}`);

  const files = execFileSync('tar', ['-tzf', archive], { encoding: 'utf8' }).split(/\r?\n/).filter(Boolean);
  const executableEntry = requireValue(
    files.find((file) => /(?:^|\/)Lastbrowser$/.test(file)),
    'The archive does not contain the Lastbrowser Linux executable.'
  );
  const workDir = mkdtempSync(join(tmpdir(), 'lastbrowser-linux-fresh-profile-'));
  let appProcess;
  try {
    let healthPortOccupied = false;
    try {
      await fetch(HEALTH_URL, { signal: AbortSignal.timeout(1000) });
      healthPortOccupied = true;
    } catch { /* No server is listening on the smoke port. */ }
    if (healthPortOccupied) throw new Error('Sidekick health port 8788 is already serving a response; stop it before the smoke.');
    execFileSync('tar', ['-xzf', archive, '-C', workDir], { stdio: 'inherit' });
    const executable = join(workDir, executableEntry);
    const appDir = dirname(executable);
    const bundledPython = join(appDir, 'resources', 'runtime', 'python', 'python3');
    if (!existsSync(bundledPython)) throw new Error(`Packaged Python launcher is missing: ${bundledPython}`);

    const importProbe = spawnSync(bundledPython, ['-c', 'import fastapi, uvicorn; print(uvicorn.__version__)'], {
      encoding: 'utf8',
      timeout: 15_000
    });
    if (importProbe.status !== 0) {
      throw new Error(`Packaged Python cannot import uvicorn.\n${importProbe.stderr || importProbe.stdout}`);
    }

    const profileDir = join(workDir, 'fresh-profile');
    const env = { ...process.env };
    env.LASTBROWSER_WEBUI_PYTHON = '/usr/bin/python3';
    env.HERMES_WEBUI_PYTHON = '/usr/bin/python3';
    appProcess = spawn(executable, [`--user-data-dir=${profileDir}`, '--no-sandbox'], {
      cwd: appDir,
      env,
      detached: true,
      stdio: 'ignore'
    });
    appProcess.once('error', (error) => { appProcess.spawnError = error; });
    const health = await waitForSidekick(appProcess, STARTUP_TIMEOUT_MS);
    if (!existsSync(profileDir)) throw new Error('Electron did not create the isolated fresh profile directory.');
    await delay(500);
    if (appProcess.exitCode !== null) throw new Error(`Lastbrowser exited after Sidekick became healthy (code ${appProcess.exitCode}).`);
    console.log(`[linux-fresh-profile] PASS: packaged uvicorn ${importProbe.stdout.trim()}, fresh profile Sidekick health=${JSON.stringify(health)}`);
  } finally {
    if (appProcess?.pid) {
      try { process.kill(-appProcess.pid, 'SIGTERM'); } catch { /* The process group may already have exited. */ }
      await delay(500);
      try { process.kill(-appProcess.pid, 'SIGKILL'); } catch { /* The process group may already have exited. */ }
    }
    rmSync(workDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(`[linux-fresh-profile] FAIL: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
