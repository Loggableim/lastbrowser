import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import yaml from 'js-yaml';

const root = resolve(import.meta.dirname, '..');
const outDir = resolve(root, 'docs/legal/inventory');
mkdirSync(outDir, { recursive: true });

const lock = yaml.load(readFileSync(resolve(root, 'pnpm-lock.yaml'), 'utf8'));
const npm = [];
const npmSkipped = [];
for (const lockPath of Object.keys(lock.packages ?? {})) {
  const separator = lockPath.lastIndexOf('@');
  const name = separator > 0 ? lockPath.slice(0, separator) : lockPath;
  const version = separator > 0 ? lockPath.slice(separator + 1) : null;
  const packageJsonPath = join(root, 'node_modules', name, 'package.json');
  let license = null;
  let installed = false;
  if (existsSync(packageJsonPath)) {
    installed = true;
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
    const declared = packageJson.license ?? packageJson.licenses;
    license = typeof declared === 'string' ? declared : (declared ? JSON.stringify(declared) : null);
  }
  npm.push({
    name,
    lockPath: `node_modules/${name}`,
    installed,
    version,
    license,
    resolved: name === 'electron' ? version : version ? `https://registry.npmjs.org/${name}/-/${name.split('/').pop()}-${version}.tgz` : null,
  });
}
for (const importer of Object.keys(lock.importers ?? {})) {
  if (importer === '.') continue;
  npmSkipped.push({ lockPath: importer, reason: 'workspace-project', resolved: null });
}
npm.sort((a, b) => a.name.localeCompare(b.name));
const npmMissing = npm.filter((row) => !row.license);
const npmCounts = {};
for (const row of npm) {
  const key = row.license ?? 'UNKNOWN';
  npmCounts[key] = (npmCounts[key] ?? 0) + 1;
}

const runtimeText = readFileSync(resolve(root, 'apps/desktop/scripts/requirements-runtime.txt'), 'utf8');
const pinned = [];
for (const line of runtimeText.split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const match = trimmed.match(/^([A-Za-z0-9_.-]+)==([^ \t]+)/);
  if (!match) continue;
  pinned.push({ name: match[1], version: match[2] });
}

async function pypi(name, version) {
  const url = `https://pypi.org/pypi/${encodeURIComponent(name)}/${encodeURIComponent(version)}/json`;
  const response = await fetch(url);
  if (!response.ok) {
    return { license: null, licenseExpression: null, homePage: null, status: `pypi-${response.status}` };
  }
  const body = await response.json();
  const info = body.info ?? {};
  const classifiers = (info.classifiers ?? []).filter((item) => item.startsWith('License ::'));
  return {
    license: info.license || null,
    licenseExpression: info.license_expression || null,
    licenseClassifiers: classifiers,
    homePage: info.home_page || info.project_url || info.project_urls?.Homepage || null,
    status: 'pypi-ok',
  };
}

const python = [];
for (const row of pinned) {
  const meta = await pypi(row.name, row.version);
  const field = (meta.licenseExpression || meta.license || '').trim();
  const classifier = (meta.licenseClassifiers ?? []).join('; ');
  python.push({
    name: row.name,
    version: row.version,
    license: field || null,
    licenseClassifiers: meta.licenseClassifiers ?? [],
    evidence: field ? meta.status : (classifier ? 'pypi-classifier-only' : meta.status),
    homePage: meta.homePage,
  });
}
const pythonMissing = python.filter((row) => !row.license && row.licenseClassifiers.length === 0);

const pyproject = readFileSync(resolve(root, 'services/sidekick/pyproject.toml'), 'utf8');
const declared = [];
for (const match of pyproject.matchAll(/"([A-Za-z0-9_.-]+)(?:\[[^\]]*\])?[=<>!~][^"]*"/g)) {
  declared.push(match[1]);
}
const pinnedNames = new Set(pinned.map((row) => row.name.toLowerCase().replaceAll('_', '-')));
const declaredNotPinned = [...new Set(declared)].filter(
  (name) => !pinnedNames.has(name.toLowerCase().replaceAll('_', '-')),
);

const joPath = resolve(root, 'services/sidekick/tools/neutts_samples/jo.wav');
const joBytes = readFileSync(joPath);
const jo = {
  path: 'services/sidekick/tools/neutts_samples/jo.wav',
  bytes: joBytes.length,
  sha256: createHash('sha256').update(joBytes).digest('hex'),
  license: null,
  note: 'No license file beside jo.wav or jo.txt. jo.txt is a Neuphonic product blurb, not a grant. Status: unknown.',
};

const generatedAt = new Date().toISOString();
const payload = {
  generatedAt,
  sources: {
    npm: 'pnpm-lock.yaml packages, with the license field read from the installed node_modules package.json',
    python: 'apps/desktop/scripts/requirements-runtime.txt plus PyPI JSON license / license_expression',
  },
  npm: {
    count: npm.length,
    installedCount: npm.filter((row) => row.installed).length,
    uniqueNames: new Set(npm.map((row) => row.name)).size,
    missingLicense: npmMissing.length,
    skipped: npmSkipped,
    counts: npmCounts,
    packages: npm,
  },
  pythonRuntime: {
    count: python.length,
    missingLicense: pythonMissing.map((row) => row.name),
    packages: python,
  },
  declaredPythonNotInRuntimePin: declaredNotPinned,
  joWav: jo,
};

writeFileSync(resolve(outDir, 'dependency-licenses.json'), `${JSON.stringify(payload, null, 2)}\n`);

const lines = [];
lines.push('# Versioned dependency license inventory');
lines.push('');
lines.push(`Generated: ${generatedAt}`);
lines.push('');
lines.push('Regenerate with `node scripts/legal-inventory.mjs` from the repository root.');
lines.push('npm rows are every package entry in `pnpm-lock.yaml`, with the license read from the matching installed `node_modules/<name>/package.json` (pnpm lockfiles do not store licenses). The count is lockfile entries, not unique names. Optional platform binaries that are not installed on this machine therefore show no license evidence. Workspace projects are listed as skipped and are not third-party packages. Python rows are the pinned Windows runtime in `apps/desktop/scripts/requirements-runtime.txt`, with the license string read from PyPI for that exact version. A missing license is unknown, not compatible.');
lines.push('');
lines.push(`npm lockfile entries: ${npm.length}. Installed entries: ${npm.filter((row) => row.installed).length}. Unique names: ${new Set(npm.map((row) => row.name)).size}. Missing license field: ${npmMissing.length}. Skipped workspace projects: ${npmSkipped.length}.`);
lines.push('');
lines.push('| SPDX or lockfile license | Count |');
lines.push('| :--- | ---: |');
for (const [license, count] of Object.entries(npmCounts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))) {
  lines.push(`| ${license} | ${count} |`);
}
lines.push('');
lines.push(`Pinned Python runtime packages: ${python.length}. Missing PyPI license: ${pythonMissing.length}.`);
lines.push('');
lines.push('| Package | Version | License evidence |');
lines.push('| :--- | :--- | :--- |');
for (const row of python) {
  const shown = row.license ?? (row.licenseClassifiers.length ? `${row.licenseClassifiers.join('; ')} (classifier only)` : 'UNKNOWN');
  lines.push(`| ${row.name} | ${row.version} | ${shown} |`);
}
lines.push('');
lines.push('Named in `services/sidekick/pyproject.toml` dependency strings but absent from the pinned runtime file. No version and no license is asserted for these names:');
lines.push('');
for (const name of declaredNotPinned) lines.push(`- ${name}`);
lines.push('');
lines.push(`jo.wav sha256 \`${jo.sha256}\` (${jo.bytes} bytes). License: unknown.`);
lines.push('');
writeFileSync(resolve(outDir, 'dependency-licenses.md'), `${lines.join('\n')}\n`);
console.log(JSON.stringify({
  npm: npm.length,
  npmInstalled: npm.filter((row) => row.installed).length,
  npmUniqueNames: new Set(npm.map((row) => row.name)).size,
  npmSkipped: npmSkipped,
  npmMissing: npmMissing.length,
  python: python.length,
  pythonMissing: pythonMissing.map((row) => row.name),
  declaredNotPinned,
  mcp: python.find((row) => row.name === 'mcp'),
}, null, 2));
