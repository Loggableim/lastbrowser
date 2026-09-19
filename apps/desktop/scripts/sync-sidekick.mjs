/**
 * Sync the bundled Sidekick runtime from the live Sidekick repo
 * (Loggableim/sidekick-agent) at build time.
 *
 * ARCHITECTURE NOTE (important):
 * The live Sidekick repo is a MONOREPO with a FastAPI server:
 *   cli/web_server.py  ->  uvicorn cli.web_server:app
 *   web/api/*.py       ->  `from web.api.*` (package imports)
 *   agent/, gateway/   ->  agent runtime
 *   deps: fastapi>=0.104, uvicorn>=0.24
 *
 * The older bundled layout split this into services/sidekick (agent) +
 * services/webui (a stdlib http.server fork with flat `from api.*` imports).
 * That split copy is a dead end: it cannot be updated from the live repo
 * because the import roots differ.
 *
 * Therefore this script copies the WHOLE monorepo into services/sidekick and
 * the app launches the web UI from there (`uvicorn cli.web_server:app`).
 * services/webui stays in the tree only as a legacy fallback.
 *
 * Usage:
 *   node scripts/sync-sidekick.mjs
 */
import { spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applySidekickPatches } from './sidekick-patches.mjs';

const REPO = process.env.LASTBROWSER_SIDEKICK_REPO || 'https://github.com/Loggableim/sidekick-agent.git';
const REF = process.env.LASTBROWSER_SIDEKICK_REF || 'master';
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const desktopDir = path.resolve(scriptDir, '..');
const repoRoot = path.resolve(desktopDir, '..', '..');
const cacheDir = process.env.LASTBROWSER_SIDEKICK_CACHE
  || path.join(repoRoot, 'node_modules', '.lastbrowser-sidekick-cache');
const targetDir = path.join(repoRoot, 'services', 'sidekick');

// Never copy these into the bundle.
const EXCLUDE_DIRS = new Set([
  '.git', '__pycache__', '.pytest_cache', '.ruff_cache', '.mypy_cache',
  'node_modules', '.venv', 'venv', 'home', 'output', 'build', '.playwright-mcp'
]);
// Runtime data / secrets that must not ship.
const EXCLUDE_FILES = new Set([
  'auth.json', 'auth.lock', 'state.db', 'state.db-shm', 'state.db-wal',
  '.env', 'config.yaml', 'sessions.db'
]);

function run(cmd, args) {
  const result = spawnSync(cmd, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    cwd: cacheDir
  });
  return {
    ok: result.status === 0,
    stdout: (result.stdout || '').trim(),
    stderr: (result.stderr || '').trim()
  };
}

function fetchRepo() {
  mkdirSync(cacheDir, { recursive: true });
  if (!existsSync(path.join(cacheDir, '.git'))) {
    console.log(`[sync-sidekick] cloning ${REPO} (shallow, ${REF})…`);
    const clone = run('git', ['clone', '--depth', '50', '--branch', REF, REPO, cacheDir]);
    if (!clone.ok) throw new Error(`git clone failed: ${clone.stderr}`);
  } else {
    console.log('[sync-sidekick] updating cache…');
    const fetch = run('git', ['fetch', '--depth', '50', 'origin', REF]);
    if (!fetch.ok) throw new Error(`git fetch failed: ${fetch.stderr}`);
    const checkout = run('git', ['checkout', '--force', `origin/${REF}`]);
    if (!checkout.ok) throw new Error(`git checkout failed: ${checkout.stderr}`);
  }
  const describe = run('git', ['describe', '--tags', '--always', '--dirty']);
  const version = describe.ok ? describe.stdout : 'unknown';
  console.log(`[sync-sidekick] source version: ${version}`);
  return version;
}

/**
 * Personal data that must never ship in the public Lastbrowser bundle.
 * Mirrors the sanitizer used for the initial public release.
 */
function sanitizeFile(absPath) {
  let text;
  try {
    text = readFileSync(absPath, 'utf8');
  } catch {
    return false;
  }
  const original = text;
  text = text
    .replaceAll('dominikrnr@gmail.com', 'user@example.com')
    .replaceAll('loggableim@gmail.com', 'user@example.com')
    .replaceAll('logga@logga.de', 'user@example.com')
    .replaceAll('C:\\Users\\logga', 'C:\\Users\\<user>')
    .replaceAll('C:/Users/logga', 'C:/Users/<user>')
    .replaceAll('C:\\\\Users\\\\logga', 'C:\\\\Users\\\\<user>');
  if (text !== original) {
    writeFileSync(absPath, text);
    return true;
  }
  return false;
}

function sanitizeTree(rootDir) {
  if (!existsSync(rootDir)) return 0;
  let changed = 0;
  const stack = [rootDir];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try {
      entries = readdirSync(dir);
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry);
      if (EXCLUDE_DIRS.has(entry)) continue;
      let isDir = false;
      try {
        isDir = statSync(full).isDirectory();
      } catch {
        continue;
      }
      if (isDir) {
        stack.push(full);
      } else if (/\.(py|js|md|html|json|yaml|yml|txt|ts|tsx|css|sh|bat|ps1)$/i.test(entry)) {
        if (sanitizeFile(full)) changed += 1;
      }
    }
  }
  return changed;
}

function copyTree(src, dest) {
  cpSync(src, dest, {
    recursive: true,
    filter: (srcPath) => {
      const base = path.basename(srcPath);
      if (EXCLUDE_DIRS.has(base) || EXCLUDE_FILES.has(base)) return false;
      return true;
    }
  });
}

/**
 * Remove a directory tree, retrying on Windows lock errors (EPERM/EBUSY).
 * Returns false when the tree could not be removed — the caller then syncs
 * in place instead of failing the build.
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
      // Give the lock holder a moment to release.
      const wait = 300 * (attempt + 1);
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, wait);
    }
  }
  return false;
}

function main() {
  const version = fetchRepo();

  // The bundled skills/ tree is Lastbrowser-specific (the live repo ships only
  // a handful of its own skills). Preserve it across syncs.
  const skillsDir = path.join(targetDir, 'skills');
  const preservedSkills = path.join(repoRoot, 'node_modules', '.lastbrowser-skills-preserve');
  if (existsSync(skillsDir)) {
    rmSync(preservedSkills, { recursive: true, force: true });
    cpSync(skillsDir, preservedSkills, { recursive: true });
    console.log('[sync-sidekick] preserved bundled skills/');
  }

  // Replace the bundled monorepo wholesale so no stale files linger.
  // On Windows a running sidecar (or a shell sitting in the directory) can
  // hold a lock on the tree, so a plain rmSync fails with EPERM. Retry a few
  // times, and if the directory still cannot be removed, fall back to syncing
  // into it in place (copy over the top) rather than failing the build.
  console.log(`[sync-sidekick] replacing ${targetDir}`);
  const removed = removeTreeWithRetry(targetDir);
  if (!removed) {
    console.warn('[sync-sidekick] could not remove the existing tree (locked); syncing in place');
  }
  mkdirSync(targetDir, { recursive: true });

  // Copy every top-level entry except the excludes.
  for (const entry of readdirSync(cacheDir)) {
    if (EXCLUDE_DIRS.has(entry) || EXCLUDE_FILES.has(entry)) continue;
    const src = path.join(cacheDir, entry);
    const dest = path.join(targetDir, entry);
    let isDir = false;
    try {
      isDir = statSync(src).isDirectory();
    } catch {
      continue;
    }
    if (isDir) {
      copyTree(src, dest);
    } else {
      cpSync(src, dest);
    }
  }

  // Restore the preserved Lastbrowser skills, merged with any upstream ones.
  if (existsSync(preservedSkills)) {
    cpSync(preservedSkills, skillsDir, { recursive: true });
    rmSync(preservedSkills, { recursive: true, force: true });
    console.log('[sync-sidekick] restored bundled skills/');
  }

  const changed = sanitizeTree(targetDir);
  console.log(`[sync-sidekick] sanitizer rewrote ${changed} file(s)`);

  // Re-apply our local fixes: the sync replaces the tree wholesale, so any
  // patch we made to the vendored copy would otherwise be lost.
  const { applied, skipped } = applySidekickPatches(targetDir, { readFileSync, writeFileSync }, path);
  if (applied.length) console.log(`[sync-sidekick] applied patches: ${applied.join(', ')}`);
  if (skipped.length) console.log(`[sync-sidekick] skipped patches: ${skipped.join(', ')}`);

  // Version marker: the bundled copy has no .git, so bake the version in.
  const versionFile = path.join(targetDir, 'web', 'api', '_version.py');
  mkdirSync(path.dirname(versionFile), { recursive: true });
  writeFileSync(versionFile, `__version__ = '${version.replace(/'/g, '')}'\n`, 'utf8');

  const manifest = {
    syncedAt: new Date().toISOString(),
    source: REPO,
    ref: REF,
    version,
    entrypoint: 'cli.web_server:app'
  };
  writeFileSync(
    path.join(repoRoot, 'services', 'sidekick-source.json'),
    JSON.stringify(manifest, null, 2),
    'utf8'
  );

  console.log(`[sync-sidekick] done — bundled Sidekick ${version}`);
}

main();
