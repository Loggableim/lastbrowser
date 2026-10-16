import { chmodSync, copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const desktopDir = resolve(scriptDir, '..');
const repoRoot = resolve(desktopDir, '..', '..');
const runtimeDir = resolve(desktopDir, 'runtime');
const pythonRuntimeDir = resolve(runtimeDir, 'python');
const markerPath = join(pythonRuntimeDir, '.lastbrowser-runtime.json');
const requirementsPath = resolve(scriptDir, 'requirements-runtime.txt');

export function runtimeDependencyDigest(paths = [requirementsPath, resolve(repoRoot, 'services', 'sidekick', 'pyproject.toml')]) {
  const digest = createHash('sha256');
  for (const filePath of paths) {
    const bytes = readFileSync(filePath);
    digest.update(String(bytes.length)).update(':').update(bytes);
  }
  return digest.digest('hex');
}

export function pythonRuntimeExecutableName(platform = process.platform) {
  return platform === 'win32' ? 'python.exe' : 'python3';
}

export function pythonRuntimeExecutablePath(home, platform = process.platform) {
  const name = pythonRuntimeExecutableName(platform);
  const direct = join(home, name);
  if (platform === 'win32' || existsSync(direct)) return direct;
  return join(home, 'bin', name);
}

export function posixPythonLauncherScript() {
  return '#!/bin/sh\ncd "$(dirname "$0")" || exit 1\nexec ./bin/python3 "$@"\n';
}

export function resolveWheelhouseDir(env = process.env) {
  const explicit = env.LASTBROWSER_WHEELHOUSE?.trim();
  if (explicit) return resolve(explicit);
  return resolve(runtimeDir, 'wheelhouse');
}

export function resolveLinuxWheelhouseDir(env = process.env) {
  const explicit = env.LASTBROWSER_LINUX_WHEELHOUSE?.trim();
  if (explicit) return resolve(explicit);
  return resolve(runtimeDir, 'wheelhouse-linux-x64');
}

export function verifyWheelhouse(wheelhouseDir) {
  if (!existsSync(wheelhouseDir)) {
    throw new Error(
      `[prepare:python] Offline Python runtime wheelhouse is missing: ${wheelhouseDir}\n` +
      'Offline packaging requires pre-downloaded wheels in runtime/wheelhouse to ensure 100% deterministic builds without internet access.\n' +
      'Run "npm run prepare:python:online" while connected to the internet to populate the wheelhouse, or set LASTBROWSER_WHEELHOUSE.'
    );
  }
  const wheels = readdirSync(wheelhouseDir).filter((file) => file.endsWith('.whl'));
  if (wheels.length === 0) {
    throw new Error(
      `[prepare:python] Offline Python runtime wheelhouse at ${wheelhouseDir} contains no .whl files.\n` +
      'Offline packaging requires pre-downloaded wheels in runtime/wheelhouse to ensure 100% deterministic builds without internet access.\n' +
      'Run "npm run prepare:python:online" while connected to the internet to populate the wheelhouse, or set LASTBROWSER_WHEELHOUSE.'
    );
  }
  return wheels;
}

export function writeLinuxWheelhouseManifest(wheelhouseDir) {
  const wheels = readdirSync(wheelhouseDir).filter((file) => file.endsWith('.whl')).sort();
  if (!wheels.length) throw new Error(`[prepare:python] No Linux wheels found in ${wheelhouseDir}.`);
  const manifest = {
    schemaVersion: 1,
    wheels: wheels.map((file) => ({
      file,
      sha256: createHash('sha256').update(readFileSync(join(wheelhouseDir, file))).digest('hex')
    }))
  };
  writeFileSync(join(wheelhouseDir, 'SHA256SUMS.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return manifest.wheels;
}

/**
 * Relocatable CPython 3.12 from astral-sh/python-build-standalone.
 * A venv created with --copies still records `home = /usr/bin` and loads
 * encodings from the build host's /usr/lib/python3.12. This prefix does not.
 */
export const linuxStandalonePython = Object.freeze({
  distribution: 'python-build-standalone',
  release: '20261013',
  cpython: '3.12.15',
  filename: 'cpython-3.12.15+20261013-x86_64-unknown-linux-gnu-install_only_stripped.tar.gz',
  sha256: '178d3d83b6e8e99285a65d3fce9c16b87952cc5efdb4d1a0e3ff3be18ff0fc9c',
  url: 'https://github.com/astral-sh/python-build-standalone/releases/download/20261013/cpython-3.12.15%2B20261013-x86_64-unknown-linux-gnu-install_only_stripped.tar.gz'
});

export function linuxStandaloneTarballPath(env = process.env) {
  const explicit = env.LASTBROWSER_PYTHON_STANDALONE_TARBALL?.trim();
  if (explicit) return resolve(explicit);
  return resolve(runtimeDir, 'python-standalone', linuxStandalonePython.filename);
}

export function assertRelocatableCPython(pythonExe, runtimeRoot) {
  const pyvenv = join(runtimeRoot, 'pyvenv.cfg');
  if (existsSync(pyvenv)) {
    throw new Error(`Linux runtime must be a python-build-standalone prefix, not a venv (${pyvenv}).`);
  }
  const probe = [
    'import encodings, sys',
    'enc = getattr(encodings, "__file__", "") or ""',
    'base = sys.base_prefix or ""',
    'if "/usr/lib/python" in enc or not enc:',
    '    raise SystemExit("encodings resolved from the host stdlib: " + enc)',
    'if base == "/usr" or base.startswith("/usr/"):',
    '    raise SystemExit("base_prefix is a host path: " + base)',
    'print(base)',
    'print(enc)'
  ].join('\n');
  const env = { ...process.env };
  delete env.PYTHONHOME;
  delete env.PYTHONPATH;
  const result = spawnSync(pythonExe, ['-I', '-c', probe], {
    encoding: 'utf8',
    timeout: 30_000,
    env
  });
  if (result.status !== 0) {
    throw new Error(
      `Bundled CPython is not relocatable (${pythonExe}).\n${result.stderr || result.stdout || result.error || ''}`
    );
  }
  const libpython = hostLibpython(pythonExe, runtimeRoot);
  if (libpython) {
    throw new Error(`Bundled CPython still links host libpython: ${libpython}`);
  }
  return result.stdout.trim();
}

function hostLibpython(pythonExe, runtimeRoot) {
  const result = spawnSync('ldd', [pythonExe], { encoding: 'utf8', timeout: 15_000 });
  if (result.status !== 0) {
    throw new Error(`ldd failed for ${pythonExe}\n${result.stderr || ''}`);
  }
  const root = resolve(runtimeRoot);
  for (const line of result.stdout.split(/\r?\n/)) {
    const match = line.match(/libpython[\w.+-]*\s+=>\s+(\S+)/);
    if (!match) continue;
    const resolved = match[1];
    if (resolved === 'not') return line.trim();
    const resolvedPath = resolve(resolved);
    if (resolvedPath !== root && !resolvedPath.startsWith(`${root}/`)) return line.trim();
  }
  return '';
}

function sha256File(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

function ensureLinuxStandaloneTarball({ allowDownload }) {
  const dest = linuxStandaloneTarballPath();
  if (existsSync(dest) && sha256File(dest) === linuxStandalonePython.sha256) return dest;
  if (existsSync(dest)) {
    throw new Error(
      `[prepare:python] Standalone CPython tarball checksum mismatch: ${dest}\n` +
      `Expected ${linuxStandalonePython.sha256}.`
    );
  }
  if (!allowDownload) {
    throw new Error(
      `[prepare:python] Relocatable CPython tarball is missing: ${dest}\n` +
      'Run "npm run prepare:python:online" once to download the pinned python-build-standalone archive, ' +
      'or set LASTBROWSER_PYTHON_STANDALONE_TARBALL to a copy with the pinned SHA-256.'
    );
  }
  mkdirSync(dirname(dest), { recursive: true });
  const partial = `${dest}.partial`;
  console.log(`[prepare:python] Downloading relocatable CPython ${linuxStandalonePython.cpython}+${linuxStandalonePython.release}`);
  run('curl', ['-fL', '--retry', '3', '-o', partial, linuxStandalonePython.url]);
  const actual = sha256File(partial);
  if (actual !== linuxStandalonePython.sha256) {
    rmSync(partial, { force: true });
    throw new Error(`[prepare:python] Downloaded standalone CPython checksum mismatch: ${actual}`);
  }
  renameSync(partial, dest);
  return dest;
}

function materializePython3Binary(runtimeRoot) {
  const real = join(runtimeRoot, 'bin', 'python3.12');
  const alias = join(runtimeRoot, 'bin', 'python3');
  rmSync(alias, { force: true });
  copyFileSync(real, alias);
  chmodSync(alias, 0o755);
}

function extractLinuxStandalonePython(tarball) {
  mkdirSync(pythonRuntimeDir, { recursive: true });
  run('tar', ['-xzf', tarball, '-C', pythonRuntimeDir, '--strip-components=1']);
  const pythonExe = join(pythonRuntimeDir, 'bin', 'python3.12');
  if (!existsSync(pythonExe)) {
    throw new Error(`[prepare:python] Standalone archive did not contain bin/python3.12 under ${pythonRuntimeDir}`);
  }
  return pythonExe;
}

function prepareLinuxStandalonePython() {
  const wheelhouseDir = resolveLinuxWheelhouseDir();
  const isOnline = process.argv.includes('--online');
  const isDownloadOnly = process.argv.includes('--download-wheels');
  const tarball = ensureLinuxStandaloneTarball({ allowDownload: isOnline || isDownloadOnly });
  if (isOnline || isDownloadOnly) {
    mkdirSync(wheelhouseDir, { recursive: true });
    console.log(`[prepare:python] Downloading Linux x64 wheels from ${requirementsPath} -> ${wheelhouseDir}`);
    const hostPython = spawnSync('python3', ['-c', 'import sys; print(sys.executable)'], { encoding: 'utf8' });
    const hostExe = hostPython.stdout?.trim();
    if (hostPython.status !== 0 || !hostExe) {
      throw new Error('Downloading the Linux wheelhouse needs a host python3 with pip. The packaged runtime does not use it.');
    }
    run(hostExe, ['-m', 'pip', 'download', '--only-binary=:all:', '--dest', wheelhouseDir, '-r', requirementsPath]);
    writeLinuxWheelhouseManifest(wheelhouseDir);
    if (isDownloadOnly) {
      console.log(`[prepare:python] Linux wheelhouse and standalone CPython are ready.`);
      return;
    }
  }

  const pythonExe = join(pythonRuntimeDir, 'bin', 'python3.12');
  const desired = {
    sourcePythonHome: `${linuxStandalonePython.distribution}:${linuxStandalonePython.release}`,
    sourceVersion: `${linuxStandalonePython.cpython}+${linuxStandalonePython.release}`,
    standaloneSha256: linuxStandalonePython.sha256,
    runtimeSchema: 9,
    dependencyDigest: runtimeDependencyDigest()
  };
  if (isPreparedRuntimeCompatible(readMarker(), desired, existsSync(pythonExe), hasLinuxRuntimeImports(pythonExe))) {
    try {
      materializePython3Binary(pythonRuntimeDir);
      assertRelocatableCPython(pythonExe, pythonRuntimeDir);
      precompileSidekickBytecode(pythonExe);
      const launcher = writePosixLauncher();
      console.log(`[prepare:python] Relocatable CPython already prepared: ${launcher} -> ${pythonExe}`);
      return;
    } catch (error) {
      console.log(`[prepare:python] Replacing cached runtime: ${errorMessage(error)}`);
    }
  }

  verifyLinuxWheelhouse(wheelhouseDir);
  if (existsSync(pythonRuntimeDir) && !replaceRuntimeTreeIfUnused(pythonRuntimeDir)) {
    throw new Error(
      `Could not replace the Python runtime at ${pythonRuntimeDir} — a process is holding it.\n` +
      'Close Lastbrowser (and any shell inside that directory) and retry.'
    );
  }
  console.log(`[prepare:python] Installing python-build-standalone ${linuxStandalonePython.cpython}+${linuxStandalonePython.release}`);
  const bundledPython = extractLinuxStandalonePython(tarball);
  materializePython3Binary(pythonRuntimeDir);
  run(bundledPython, [
    '-m', 'pip', 'install', '--no-index', '--find-links', wheelhouseDir,
    '--no-cache-dir', '--no-compile', '-r', requirementsPath
  ]);
  run(bundledPython, [
    '-m', 'pip', 'install', '--no-index', '--no-deps', '--no-build-isolation',
    '--find-links', wheelhouseDir, resolve(repoRoot, 'services', 'sidekick')
  ]);
  assertRelocatableCPython(bundledPython, pythonRuntimeDir);
  precompileSidekickBytecode(bundledPython);
  run(bundledPython, [
    '-c',
    'from fastapi import FastAPI; from httpx import Client; from openai import OpenAI; import anthropic, requests, uvicorn, yaml, PIL, psutil; OpenAI(api_key="smoke", base_url="http://127.0.0.1:1"); anthropic.Anthropic(api_key="smoke"); print("[prepare:python] Core Sidekick imports verified")'
  ]);
  writeFileSync(markerPath, `${JSON.stringify(desired, null, 2)}\n`, 'utf8');
  const launcher = writePosixLauncher();
  console.log(`[prepare:python] Relocatable CPython ready: ${launcher} -> ${bundledPython}`);
}

export function verifyLinuxWheelhouse(wheelhouseDir) {
  if (!existsSync(wheelhouseDir)) {
    throw new Error(`[prepare:python] Linux wheelhouse is missing: ${wheelhouseDir}. Run "npm run prepare:python:online" on Linux x64 first.`);
  }
  const manifestPath = join(wheelhouseDir, 'SHA256SUMS.json');
  if (!existsSync(manifestPath)) {
    throw new Error(`[prepare:python] Linux wheelhouse checksum manifest is missing: ${manifestPath}. Run "npm run prepare:python:online" on Linux x64 to regenerate it.`);
  }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const wheelFiles = readdirSync(wheelhouseDir).filter((file) => file.endsWith('.whl')).sort();
  const entries = Array.isArray(manifest?.wheels) ? manifest.wheels : [];
  if (manifest?.schemaVersion !== 1 || !wheelFiles.length
    || JSON.stringify(entries.map((entry) => entry.file).sort()) !== JSON.stringify(wheelFiles)) {
    throw new Error(`[prepare:python] Linux wheelhouse contents do not match ${manifestPath}.`);
  }
  for (const entry of entries) {
    if (!/^[a-f0-9]{64}$/.test(entry.sha256)
      || createHash('sha256').update(readFileSync(join(wheelhouseDir, entry.file))).digest('hex') !== entry.sha256) {
      throw new Error(`[prepare:python] Linux wheel checksum mismatch: ${entry.file}`);
    }
  }
  return wheelFiles;
}

function main() {
  assertInside(desktopDir, pythonRuntimeDir);
  if (process.platform !== 'win32') {
    preparePosixPythonCommand();
    return;
  }
  const isOnline = process.argv.includes('--online');
  const isDownloadOnly = process.argv.includes('--download-wheels');
  const wheelhouseDir = resolveWheelhouseDir();

  const sourcePythonHome = resolvePythonHome();

  if (isOnline || isDownloadOnly) {
    console.log(`[prepare:python] Populating wheelhouse online from ${requirementsPath} -> ${wheelhouseDir}`);
    mkdirSync(wheelhouseDir, { recursive: true });
    run(join(sourcePythonHome, 'python.exe'), [
      '-m',
      'pip',
      'download',
      '--dest',
      wheelhouseDir,
      '-r',
      requirementsPath
    ]);
    if (isDownloadOnly) {
      console.log(`[prepare:python] Wheelhouse downloaded successfully at ${wheelhouseDir}`);
      return;
    }
  }

  const marker = readMarker();
  const desired = {
    sourcePythonHome,
    sourceVersion: pythonVersion(join(sourcePythonHome, 'python.exe')),
    // Bump when the bundled runtime dependency set changes. In particular,
    // older prepared trees can otherwise pass the cache check without the
    // OpenAI-compatible client needed by Ollama providers.
    runtimeSchema: 6,
    dependencyDigest: runtimeDependencyDigest()
  };

  if (isPreparedRuntimeCompatible(marker, desired, existsSync(join(pythonRuntimeDir, 'python.exe')))) {
    console.log(`[prepare:python] Runtime already prepared: ${pythonRuntimeDir}`);
    precompileSidekickBytecode(join(pythonRuntimeDir, 'python.exe'));
    return;
  }

  // Offline verification: fail immediately with a clear error if wheels are missing
  verifyWheelhouse(wheelhouseDir);

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
  // Bundled requirements: 'fastapi>=0.104,<1', 'uvicorn[standard]>=0.24,<1', 'requests>=2.31', 'httpx>=0.27', 'pyyaml>=6.0', 'openai>=1.0,<3', 'anthropic>=0.39.0'
  run(join(pythonRuntimeDir, 'python.exe'), [
    '-m',
    'pip',
    'install',
    '--no-index',
    '--find-links',
    wheelhouseDir,
    '--no-cache-dir',
    '--no-compile',
    '-r',
    requirementsPath,
    resolve(repoRoot, 'services', 'sidekick')
  ]);

  run(join(pythonRuntimeDir, 'python.exe'), [
    '-c',
    'from fastapi import FastAPI; from httpx import Client; from openai import OpenAI; import anthropic, requests, yaml, PIL, psutil; OpenAI(api_key="smoke", base_url="http://127.0.0.1:1"); anthropic.Anthropic(api_key="smoke"); print("[prepare:python] Core Sidekick imports verified")'
  ]);

  precompileSidekickBytecode(join(pythonRuntimeDir, 'python.exe'));
  writeFileSync(markerPath, `${JSON.stringify(desired, null, 2)}\n`, 'utf8');
  console.log(`[prepare:python] Runtime ready: ${pythonRuntimeDir}`);
}

/**
 * Compile services/sidekick with the bundled CPython 3.12 before electron-builder
 * copies it. checked-hash pycs stay valid after copies that change mtimes. Only
 * the bundled tag ships; other interpreters' caches are excluded by the packaging filters.
 */
export function precompileSidekickBytecode(pythonExe, sidekickDir = resolve(repoRoot, 'services', 'sidekick')) {
  const tag = spawnSync(pythonExe, ['-I', '-c', 'import sys; print(sys.implementation.cache_tag)'], { encoding: 'utf8' });
  if (tag.status !== 0 || tag.stdout.trim() !== 'cpython-312') {
    throw new Error(`Bundled Python must use cache tag cpython-312, got: ${tag.stdout?.trim() || 'unknown'}`);
  }
  const result = spawnSync(pythonExe, ['-I', '-m', 'compileall', '-q', '--invalidation-mode', 'checked-hash', sidekickDir], {
    encoding: 'utf8',
    timeout: 600_000
  });
  if (result.status !== 0) {
    throw new Error(`compileall failed for ${sidekickDir} with exit ${result.status}\n${result.stderr}`);
  }
  console.log(`[prepare:python] Precompiled ${sidekickDir} as cpython-312 bytecode`);
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

function writePosixLauncher() {
  const launcher = join(pythonRuntimeDir, 'python3');
  writeFileSync(launcher, posixPythonLauncherScript());
  chmodSync(launcher, 0o755);
  return launcher;
}

function preparePosixPythonCommand() {
  if (process.platform === 'linux') {
    prepareLinuxStandalonePython();
    return;
  }
  const detected = spawnSync('python3', ['-c', 'import sys; print(sys.executable)'], { encoding: 'utf8' });
  const executable = detected.stdout?.trim();
  if (detected.status !== 0 || !executable || !existsSync(executable)) {
    throw new Error('No python3 runtime found. Install Python 3 and ensure python3 is on PATH.');
  }

  const venvPython = join(pythonRuntimeDir, 'bin', 'python3');
  const wheelhouseDir = resolveWheelhouseDir();
  const desired = {
    sourcePythonHome: executable,
    sourceVersion: pythonVersion(executable),
    runtimeSchema: 6,
    dependencyDigest: runtimeDependencyDigest()
  };
  if (isPreparedRuntimeCompatible(readMarker(), desired, existsSync(venvPython))) {
    precompileSidekickBytecode(venvPython);
    const launcher = writePosixLauncher();
    console.log(`[prepare:python] POSIX runtime already prepared: ${launcher} -> ${venvPython}`);
    return;
  }

  if (existsSync(pythonRuntimeDir) && !replaceRuntimeTreeIfUnused(pythonRuntimeDir)) {
    throw new Error(
      `Could not replace the Python runtime at ${pythonRuntimeDir} — a process is holding it.\n` +
      'Close Lastbrowser (and any shell inside that directory) and retry.'
    );
  }

  console.log(`[prepare:python] Creating POSIX venv at ${pythonRuntimeDir} from ${executable}`);
  run(executable, ['-m', 'venv', '--copies', pythonRuntimeDir]);
  const pipArgs = ['-m', 'pip', 'install', '--no-cache-dir', '--no-compile'];
  if (existsSync(wheelhouseDir)) pipArgs.push('--find-links', wheelhouseDir);
  pipArgs.push('-r', requirementsPath, resolve(repoRoot, 'services', 'sidekick'));
  run(venvPython, pipArgs);
  precompileSidekickBytecode(venvPython);
  run(venvPython, [
    '-c',
    'from fastapi import FastAPI; from httpx import Client; from openai import OpenAI; import anthropic, requests, uvicorn, yaml, PIL, psutil; OpenAI(api_key="smoke", base_url="http://127.0.0.1:1"); anthropic.Anthropic(api_key="smoke"); print("[prepare:python] Core Sidekick imports verified")'
  ]);
  writeFileSync(markerPath, `${JSON.stringify(desired, null, 2)}\n`, 'utf8');
  const launcher = writePosixLauncher();
  console.log(`[prepare:python] POSIX runtime command ready: ${launcher} -> ${venvPython}`);
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
  // Stdlib bytecode from this same CPython 3.12 home ships precompiled, so workers
  // do not recompile the stdlib on every spawn (PYTHONDONTWRITEBYTECODE=1).
  if (normalized.endsWith('.pyc') && !normalized.endsWith('.cpython-312.pyc')) return false;
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

function readMarker() {
  try {
    return JSON.parse(readFileSync(markerPath, 'utf8'));
  } catch {
    return null;
  }
}

export function isPreparedRuntimeCompatible(marker, desired, hasPythonExecutable, hasRuntimeImports = true) {
  return Boolean(
    hasPythonExecutable &&
    hasRuntimeImports &&
    marker &&
    desired &&
    marker.sourcePythonHome === desired.sourcePythonHome &&
    marker.sourceVersion === desired.sourceVersion &&
    marker.runtimeSchema === desired.runtimeSchema &&
    (desired.standaloneSha256 === undefined || marker.standaloneSha256 === desired.standaloneSha256) &&
    typeof desired.dependencyDigest === 'string' &&
    /^[a-f0-9]{64}$/.test(desired.dependencyDigest) &&
    marker.dependencyDigest === desired.dependencyDigest
  );
}

function hasLinuxRuntimeImports(pythonExe) {
  if (!existsSync(pythonExe)) return false;
  const result = spawnSync(pythonExe, ['-I', '-c', 'import pydantic, fastapi, uvicorn, requests, httpx, yaml, PIL, psutil'], {
    encoding: 'utf8',
    timeout: 15_000
  });
  return result.status === 0;
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
