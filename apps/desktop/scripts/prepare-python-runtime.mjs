import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const desktopDir = resolve(scriptDir, '..');
const repoRoot = resolve(desktopDir, '..', '..');
const runtimeDir = resolve(desktopDir, 'runtime');
const pythonRuntimeDir = resolve(runtimeDir, 'python');
const markerPath = join(pythonRuntimeDir, '.lastbrowser-runtime.json');

function main() {
  assertInside(desktopDir, pythonRuntimeDir);
  const sourcePythonHome = resolvePythonHome();
  const marker = readMarker();
  const desired = {
    sourcePythonHome,
    sourceVersion: pythonVersion(join(sourcePythonHome, 'python.exe')),
    packageVersion: readPackageVersion(),
    // Bump when the bundled runtime dependency set changes. In particular,
    // older prepared trees can otherwise pass the cache check without the
    // OpenAI-compatible client needed by Ollama providers.
    runtimeSchema: 5
  };

  if (
    marker &&
    marker.sourcePythonHome === desired.sourcePythonHome &&
    marker.sourceVersion === desired.sourceVersion &&
    marker.packageVersion === desired.packageVersion &&
    marker.runtimeSchema === desired.runtimeSchema &&
    existsSync(join(pythonRuntimeDir, 'python.exe'))
  ) {
    console.log(`[prepare:python] Runtime already prepared: ${pythonRuntimeDir}`);
    return;
  }

  console.log(`[prepare:python] Preparing Python runtime from ${sourcePythonHome}`);
  // Never replace a runtime while Sidekick (or any other process) may still
  // have its executable or files loaded. A process-listing failure also
  // refuses the operation; a Windows lock retry is not a safe substitute.
  // Windows can hold a lock on the tree. If the tree still cannot be removed,
  // fail with a clear message instead of an opaque EPERM stack.
  if (!replaceRuntimeTreeIfUnused(pythonRuntimeDir)) {
    throw new Error(
      `Could not replace the Python runtime at ${pythonRuntimeDir} — a process is holding it.\n` +
      'Close Lastbrowser (and any shell inside that directory) and retry.'
    );
  }
  mkdirSync(pythonRuntimeDir, { recursive: true });
  copyPythonHome(sourcePythonHome, pythonRuntimeDir);

  run(join(pythonRuntimeDir, 'python.exe'), ['-m', 'ensurepip', '--upgrade']);
  // The bundled Sidekick runtime is the live monorepo, whose web UI runs on
  // FastAPI/uvicorn (cli/web_server.py) and whose agent tools import requests
  // and httpx. Those must be present in the packaged Python or the sidecar
  // starts with a degraded tool set ("No module named 'requests'").
  run(join(pythonRuntimeDir, 'python.exe'), [
    '-m',
    'pip',
    'install',
    '--no-cache-dir',
    '--upgrade',
    'fastapi>=0.104,<1',
    'uvicorn[standard]>=0.24,<1',
    'requests>=2.31',
    'httpx>=0.27',
    'pyyaml>=6.0',
    'openai>=1.0,<3',
    'anthropic>=0.39.0',
    resolve(repoRoot, 'services', 'sidekick')
  ]);

  run(join(pythonRuntimeDir, 'python.exe'), [
    '-c',
    'from fastapi import FastAPI; from httpx import Client; from openai import OpenAI; import anthropic, requests, yaml; OpenAI(api_key="smoke", base_url="http://127.0.0.1:1"); anthropic.Anthropic(api_key="smoke"); print("[prepare:python] Core Sidekick imports verified")'
  ]);

  writeFileSync(markerPath, `${JSON.stringify(desired, null, 2)}\n`, 'utf8');
  console.log(`[prepare:python] Runtime ready: ${pythonRuntimeDir}`);
}

/**
 * Fail closed before a runtime replacement if process inspection is uncertain
 * or any process executable/command line points into the target tree.
 * Dependencies are injectable so tests can prove refusal happens before rm.
 */
export function replaceRuntimeTreeIfUnused(dir, {
  platform = process.platform,
  inspect = inspectRuntimeProcesses,
  remove = removeTreeWithRetry
} = {}) {
  let processes;
  try {
    processes = inspect(dir, platform);
  } catch (error) {
    throw new Error(
      `Refusing to replace the Python runtime at ${dir}: process inspection failed (${errorMessage(error)}).`
    );
  }
  if (!Array.isArray(processes)) {
    throw new Error(`Refusing to replace the Python runtime at ${dir}: process inspection returned invalid data.`);
  }

  const runtimePath = normalizeProcessPath(dir, platform).replace(/[\\/]+$/, '');
  const active = [];
  for (const entry of processes) {
    if (!entry || typeof entry !== 'object') {
      throw new Error(`Refusing to replace the Python runtime at ${dir}: process inspection returned an invalid entry.`);
    }
    const name = String(entry.name ?? entry.Name ?? '').trim().toLowerCase();
    const executable = String(entry.executablePath ?? entry.ExecutablePath ?? '').trim();
    const commandLine = String(entry.commandLine ?? entry.CommandLine ?? '').trim();
    if (platform === 'win32' && /^(python|pythonw)(?:\d+(?:\.\d+)*)?\.exe$/.test(name) && !executable) {
      throw new Error(
        `Refusing to replace the Python runtime at ${dir}: cannot determine the executable path for ${name}.`
      );
    }
    if (processUsesRuntimeTree(runtimePath, executable, commandLine, platform)) {
      active.push(`${name || 'unknown process'}${entry.pid ?? entry.ProcessId ? ` (PID ${entry.pid ?? entry.ProcessId})` : ''}`);
    }
  }

  if (active.length) {
    throw new Error(
      `Refusing to replace the Python runtime at ${dir}: it is in use by ${active.join(', ')}. ` +
      'Close Lastbrowser and wait for its Sidekick processes to exit, then retry.'
    );
  }
  return remove(dir);
}

function inspectRuntimeProcesses(_dir, platform) {
  if (platform === 'win32') return inspectWindowsProcesses();
  return inspectPosixProcesses();
}

function inspectWindowsProcesses() {
  const script = [
    '[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)',
    "$ErrorActionPreference = 'Stop'",
    'try {',
    '  @(Get-CimInstance -ClassName Win32_Process -ErrorAction Stop | Select-Object Name, ProcessId, ExecutablePath, CommandLine) | ConvertTo-Json -Compress -Depth 3',
    '} catch {',
    '  [Console]::Error.WriteLine($_.Exception.Message)',
    '  exit 1',
    '}'
  ].join('\n');
  const result = spawnSync('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script], {
    encoding: 'utf8',
    windowsHide: true,
    timeout: 15000
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(result.stderr?.trim() || `PowerShell exited with status ${result.status}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(result.stdout || '[]');
  } catch (error) {
    throw new Error(`PowerShell returned invalid process data: ${errorMessage(error)}`);
  }
  if (!Array.isArray(parsed)) parsed = [parsed];
  return parsed.map((entry) => ({
    name: entry?.Name,
    pid: entry?.ProcessId,
    executablePath: entry?.ExecutablePath,
    commandLine: entry?.CommandLine
  }));
}

function inspectPosixProcesses() {
  const result = spawnSync('ps', ['-eo', 'pid=,comm=,args='], {
    encoding: 'utf8',
    timeout: 15000
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr?.trim() || `ps exited with status ${result.status}`);
  return result.stdout.split(/\r?\n/).filter(Boolean).map((line) => {
    const match = line.match(/^\s*(\d+)\s+(\S+)\s*(.*)$/);
    if (!match) throw new Error(`Could not parse process row: ${line}`);
    return { pid: Number(match[1]), name: match[2], commandLine: match[3] };
  });
}

function processUsesRuntimeTree(runtimePath, executable, commandLine, platform) {
  const normalizedExecutable = executable ? normalizeProcessPath(executable, platform) : '';
  if (normalizedExecutable && isPathInside(runtimePath, normalizedExecutable, platform)) return true;
  const normalizedCommandLine = commandLine ? normalizeProcessPath(commandLine, platform) : '';
  return normalizedCommandLine.includes(runtimePath);
}

function normalizeProcessPath(value, platform) {
  let normalized = String(value).replaceAll('"', '').trim();
  if (platform === 'win32') return normalized.replaceAll('/', '\\').toLowerCase();
  return normalized.replaceAll('\\', '/');
}

function isPathInside(root, candidate, platform) {
  const separator = platform === 'win32' ? '\\' : '/';
  return candidate === root || candidate.startsWith(`${root}${separator}`);
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function resolvePythonHome() {
  const explicitHome = process.env.LASTBROWSER_PYTHON_HOME?.trim();
  if (explicitHome) return requirePythonHome(explicitHome);

  const explicitExe = process.env.LASTBROWSER_PYTHON_EXE?.trim();
  if (explicitExe) return pythonBasePrefix(explicitExe);

  const hermesVenv = resolve('E:/HermesPortable/venv/pyvenv.cfg');
  if (existsSync(hermesVenv)) {
    const home = readPyvenvHome(hermesVenv);
    if (home && existsSync(join(home, 'python.exe'))) return requirePythonHome(home);
  }

  const candidates = [
    { cmd: 'py', args: ['-3.12', '-c', 'import sys; print(sys.base_prefix)'] },
    { cmd: 'python', args: ['-c', 'import sys; print(sys.base_prefix)'] }
  ];
  for (const { cmd, args } of candidates) {
    const result = spawnSync(cmd, args, {
      encoding: 'utf8'
    });
    const home = result.stdout?.trim();
    if (result.status === 0 && home && existsSync(join(home, 'python.exe'))) return requirePythonHome(home);
  }

  throw new Error('No Python 3.12 runtime source found. Set LASTBROWSER_PYTHON_HOME or LASTBROWSER_PYTHON_EXE.');
}

function requirePythonHome(home) {
  const resolved = resolve(home);
  const pythonExe = join(resolved, 'python.exe');
  if (!existsSync(pythonExe)) throw new Error(`Python source does not contain python.exe: ${resolved}`);
  return resolved;
}

function pythonBasePrefix(pythonExe) {
  const result = spawnSync(pythonExe, ['-c', 'import sys; print(sys.base_prefix)'], {
    encoding: 'utf8'
  });
  if (result.status !== 0) throw new Error(`Could not inspect Python executable: ${pythonExe}\n${result.stderr}`);
  return requirePythonHome(result.stdout.trim());
}

function readPyvenvHome(pyvenvPath) {
  const lines = readFileSync(pyvenvPath, 'utf8').split(/\r?\n/);
  const homeLine = lines.find((line) => line.trim().startsWith('home ='));
  return homeLine ? homeLine.split('=').slice(1).join('=').trim() : '';
}

function copyPythonHome(source, target) {
  for (const name of ['python.exe', 'pythonw.exe', 'python3.dll']) {
    const file = join(source, name);
    if (existsSync(file)) copyFileSync(file, join(target, name));
  }

  for (const file of listMatching(source, /^python\d+\.dll$/i)) {
    copyFileSync(join(source, file), join(target, file));
  }
  for (const file of listMatching(source, /^vcruntime.*\.dll$/i)) {
    copyFileSync(join(source, file), join(target, file));
  }

  cpSync(join(source, 'DLLs'), join(target, 'DLLs'), {
    recursive: true,
    filter: runtimeFilter
  });
  cpSync(join(source, 'Lib'), join(target, 'Lib'), {
    recursive: true,
    filter: runtimeFilter
  });
}

function runtimeFilter(src) {
  const normalized = src.replaceAll('\\', '/');
  if (normalized.includes('/Lib/site-packages')) return false;
  if (normalized.includes('/__pycache__')) return false;
  if (normalized.endsWith('.pyc')) return false;
  if (normalized.includes('/test/') || normalized.includes('/tests/')) return false;
  if (normalized.includes('/idlelib')) return false;
  if (normalized.includes('/tkinter')) return false;
  return true;
}

function listMatching(dir, pattern) {
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && pattern.test(entry.name))
    .map((entry) => entry.name);
}

function readPackageVersion() {
  const raw = readFileSync(join(desktopDir, 'package.json'), 'utf8');
  return JSON.parse(raw).version;
}

function readMarker() {
  try {
    return JSON.parse(readFileSync(markerPath, 'utf8'));
  } catch {
    return null;
  }
}

function pythonVersion(pythonExe) {
  const result = spawnSync(pythonExe, ['-c', 'import sys; print(sys.version)'], {
    encoding: 'utf8'
  });
  if (result.status !== 0) throw new Error(`Could not read Python version from ${pythonExe}\n${result.stderr}`);
  return result.stdout.trim();
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    stdio: 'inherit',
    env: {
      ...process.env,
      PIP_DISABLE_PIP_VERSION_CHECK: '1'
    }
  });
  if (result.status !== 0) throw new Error(`Command failed: ${command} ${args.join(' ')}`);
}

function assertInside(parent, child) {
  const rel = relative(resolve(parent), resolve(child));
  if (rel.startsWith('..') || rel === '' || resolve(rel) === rel) {
    throw new Error(`Refusing to modify path outside desktop directory: ${child}`);
  }
}

/**
 * Remove a directory tree, retrying on Windows lock errors (EPERM/EBUSY).
 * Returns false when the tree could not be removed.
 */
function removeTreeWithRetry(dir, attempts = 5) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
      return true;
    } catch (error) {
      const code = error && error.code;
      if (code !== 'EPERM' && code !== 'EBUSY' && code !== 'ENOTEMPTY') throw error;
      if (attempt === attempts - 1) return false;
      const wait = 300 * (attempt + 1);
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, wait);
    }
  }
  return false;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
