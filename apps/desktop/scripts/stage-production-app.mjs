import { cpSync, existsSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const desktop = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const stage = resolve(desktop, 'runtime', 'packaged-app');
const marker = join(stage, '.lastbrowser-production-stage');
const pkg = JSON.parse(readFileSync(join(desktop, 'package.json'), 'utf8'));
if (!existsSync(join(desktop, 'dist', 'main', 'main.js'))) throw new Error('Build the desktop app before staging.');
if (stage !== join(desktop, 'runtime', 'packaged-app')) throw new Error('Invalid staging path.');
if (existsSync(stage)) {
  if (!existsSync(marker) || realpathSync(stage) !== stage) throw new Error('Refusing to replace an unowned staging directory.');
  rmSync(stage, { recursive: true });
}
mkdirSync(stage, { recursive: true });
writeFileSync(marker, 'Generated offline production app staging.\n');
cpSync(join(desktop, 'dist'), join(stage, 'dist'), { recursive: true });
const production = Object.fromEntries(['name', 'version', 'private', 'type', 'description', 'author', 'main', 'dependencies'].filter(key => pkg[key] !== undefined).map(key => [key, pkg[key]]));
writeFileSync(join(stage, 'package.json'), JSON.stringify(production, null, 2));

// Resolve the installed graph from each package's own location. Physical copies
// remove workspace/junction ambiguity from electron-builder's npm collector.
const copied = new Map();
const records = [];
function locate(name, parent) {
  const require = createRequire(join(parent, 'package.json'));
  try { return dirname(require.resolve(`${name}/package.json`)); }
  catch {
    let candidate = dirname(require.resolve(name));
    while (candidate !== dirname(candidate)) {
      const manifest = join(candidate, 'package.json');
      if (existsSync(manifest) && JSON.parse(readFileSync(manifest, 'utf8')).name === name) return candidate;
      candidate = dirname(candidate);
    }
    throw new Error(`Cannot locate production package ${name}`);
  }
}
function copyDependency(name, parentSource, parentTarget, optional = false) {
  let source;
  try { source = realpathSync(locate(name, parentSource)); }
  catch (error) { if (optional) return; throw error; }
  const manifest = JSON.parse(readFileSync(join(source, 'package.json'), 'utf8'));
  const allowedOs = (manifest.os ?? []).filter(os => !os.startsWith('!'));
  if (manifest.os?.includes(`!${process.platform}`) || (allowedOs.length && !allowedOs.includes(process.platform))) {
    if (optional) return;
    throw new Error(`Unsupported production dependency ${name}`);
  }
  const rootTarget = join(stage, 'node_modules', ...name.split('/'));
  const target = !copied.has(rootTarget) || copied.get(rootTarget) === source ? rootTarget : join(parentTarget, 'node_modules', ...name.split('/'));
  if (copied.get(target) === source) return;
  if (!target.startsWith(stage + sep)) throw new Error('Dependency target outside staging directory.');
  copied.set(target, source);
  cpSync(source, target, { recursive: true, dereference: true, filter: file => !file.slice(source.length).split(sep).includes('node_modules') });
  records.push({ name, version: manifest.version, target: target.slice(stage.length + 1) });
  for (const child of Object.keys(manifest.dependencies ?? {})) copyDependency(child, source, target, Boolean(manifest.optionalDependencies?.[child]));
  for (const child of Object.keys(manifest.optionalDependencies ?? {})) copyDependency(child, source, target, true);
}
for (const name of Object.keys(pkg.dependencies ?? {})) copyDependency(name, desktop, stage);
writeFileSync(join(stage, '.lastbrowser-production-dependencies.json'), JSON.stringify(records, null, 2));
console.log(`Offline production app staged: ${records.length} packages, ${pkg.version}.`);
