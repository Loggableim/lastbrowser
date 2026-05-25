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
const sourcePythonHome = resolvePythonHome();

function main() {
  assertInside(desktopDir, pythonRuntimeDir);
  const marker = readMarker();
  const desired = {
    sourcePythonHome,
    sourceVersion: pythonVersion(join(sourcePythonHome, 'python.exe')),
    packageVersion: readPackageVersion(),
    runtimeSchema: 1
  };

  if (
    marker &&
    marker.sourcePythonHome === desired.sourcePythonHome &&
    marker.sourceVersion === desired.sourceVersion &&
    marker.packageVersion === desired.packageVersion &&
    existsSync(join(pythonRuntimeDir, 'python.exe'))
  ) {
    console.log(`[prepare:python] Runtime already prepared: ${pythonRuntimeDir}`);
    return;
  }

  console.log(`[prepare:python] Preparing Python runtime from ${sourcePythonHome}`);
  rmSync(pythonRuntimeDir, { recursive: true, force: true });
  mkdirSync(pythonRuntimeDir, { recursive: true });
  copyPythonHome(sourcePythonHome, pythonRuntimeDir);

  run(join(pythonRuntimeDir, 'python.exe'), ['-m', 'ensurepip', '--upgrade']);
  run(join(pythonRuntimeDir, 'python.exe'), [
    '-m',
    'pip',
    'install',
    '--no-cache-dir',
    '--upgrade',
    '-r',
    resolve(repoRoot, 'services', 'webui', 'requirements.txt'),
    resolve(repoRoot, 'services', 'sidekick')
  ]);

  writeFileSync(markerPath, `${JSON.stringify(desired, null, 2)}\n`, 'utf8');
  console.log(`[prepare:python] Runtime ready: ${pythonRuntimeDir}`);
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

  for (const candidate of ['py -3.12', 'python']) {
    const result = spawnSync(candidate, ['-c', 'import sys; print(sys.base_prefix)'], {
      shell: true,
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

main();
