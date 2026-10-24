import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const outDir = resolve(root, 'docs/legal/inventory');
mkdirSync(outDir, { recursive: true });

const refresh = process.argv.includes('--refresh');
const offline = process.argv.includes('--offline');

const readJson = (path, fallback = null) => {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return fallback;
  }
};
const normalize = (name) => name.toLowerCase().replaceAll('_', '-');
const mdCell = (value) => String(value ?? '').replaceAll('|', '\\|').replaceAll('\n', ' ');

// ---------------------------------------------------------------------------
// npm: every non-link node_modules entry in package-lock.json
// ---------------------------------------------------------------------------
const lock = readJson(resolve(root, 'package-lock.json'));
const desktopPkg = readJson(resolve(root, 'apps/desktop/package.json'));
const rootPkg = readJson(resolve(root, 'package.json'));

const direct = new Map();
for (const [name, range] of Object.entries(desktopPkg.dependencies ?? {})) {
  direct.set(name, { section: 'runtime', range });
}
for (const [name, range] of Object.entries(desktopPkg.devDependencies ?? {})) {
  direct.set(name, { section: 'development', range });
}
for (const [name, range] of Object.entries(rootPkg.dependencies ?? {})) {
  if (!direct.has(name)) direct.set(name, { section: 'runtime', range });
}
for (const [name, range] of Object.entries(rootPkg.devDependencies ?? {})) {
  if (!direct.has(name)) direct.set(name, { section: 'development', range });
}

const npm = [];
const npmSkipped = [];
for (const [lockPath, meta] of Object.entries(lock.packages ?? {})) {
  if (!lockPath.startsWith('node_modules/')) continue;
  if (meta.link === true) {
    npmSkipped.push({ lockPath, reason: 'workspace-link', resolved: meta.resolved ?? null });
    continue;
  }
  const name = lockPath.slice(lockPath.lastIndexOf('node_modules/') + 'node_modules/'.length);
  const topLevel = lockPath === `node_modules/${name}`;
  const declaration = topLevel ? direct.get(name) : undefined;
  npm.push({
    name,
    lockPath,
    nested: lockPath.includes('/node_modules/'),
    version: meta.version ?? null,
    license: meta.license ?? null,
    resolved: meta.resolved ?? null,
    direct: Boolean(declaration),
    directSection: declaration?.section ?? null,
    declaredRange: declaration?.range ?? null,
    dev: Boolean(meta.dev || meta.devOptional),
    optional: Boolean(meta.optional),
  });
}
npm.sort((a, b) => a.lockPath.localeCompare(b.lockPath));

const npmMissing = npm.filter((row) => !row.license);
const npmDirect = npm.filter((row) => row.direct);
const npmCounts = {};
for (const row of npm) {
  const key = row.license ?? 'UNKNOWN';
  npmCounts[key] = (npmCounts[key] ?? 0) + 1;
}
const missingDirect = [...direct.keys()].filter(
  (name) => !npm.some((row) => row.lockPath === `node_modules/${name}`),
);

// ---------------------------------------------------------------------------
// Python: pinned Windows runtime plus declarations from pyproject.toml
// ---------------------------------------------------------------------------
const runtimeText = readFileSync(resolve(root, 'apps/desktop/scripts/requirements-runtime.txt'), 'utf8');
const pinned = [];
for (const line of runtimeText.split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const match = trimmed.match(/^([A-Za-z0-9_.-]+)==([^ \t]+)/);
  if (!match) continue;
  pinned.push({ name: match[1], version: match[2] });
}

const pyproject = readFileSync(resolve(root, 'services/sidekick/pyproject.toml'), 'utf8');
const declared = [];
for (const match of pyproject.matchAll(/"([A-Za-z0-9_.-]+)(?:\[[^\]]*\])?[=<>!~][^"]*"/g)) {
  declared.push(match[1]);
}
const declaredNames = new Set(declared.map(normalize));
const pinnedNames = new Set(pinned.map((row) => normalize(row.name)));
const declaredNotPinned = [...new Set(declared)].filter((name) => !pinnedNames.has(normalize(name)));

const previous = readJson(resolve(outDir, 'dependency-licenses.json'), {});
const previousGeneratedAt = previous.generatedAt ?? null;
const cachedPython = new Map(
  (previous.pythonRuntime?.packages ?? []).map((row) => [`${normalize(row.name)}@${row.version}`, row]),
);

async function pypi(name, version) {
  const url = `https://pypi.org/pypi/${encodeURIComponent(name)}/${encodeURIComponent(version)}/json`;
  const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!response.ok) {
    return { license: null, licenseExpression: null, licenseClassifiers: [], homePage: null, status: `pypi-${response.status}` };
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

const python = new Array(pinned.length);
const concurrency = 8;
for (let offset = 0; offset < pinned.length; offset += concurrency) {
  const batch = pinned.slice(offset, offset + concurrency);
  await Promise.all(batch.map(async (row, index) => {
    const position = offset + index;
    const cached = cachedPython.get(`${normalize(row.name)}@${row.version}`);
    let meta;
    if (!refresh && cached && (cached.license || (cached.licenseClassifiers ?? []).length)) {
      meta = {
        license: cached.license,
        licenseExpression: cached.licenseExpression ?? null,
        licenseClassifiers: cached.licenseClassifiers ?? [],
        homePage: cached.homePage ?? null,
        status: cached.evidence ?? 'cached',
      };
    } else if (offline) {
      meta = { license: null, licenseExpression: null, licenseClassifiers: [], homePage: null, status: 'offline-no-cache' };
    } else {
      try {
        meta = await pypi(row.name, row.version);
      } catch (error) {
        meta = {
          license: null,
          licenseExpression: null,
          licenseClassifiers: [],
          homePage: null,
          status: `fetch-error: ${error?.name ?? 'Error'}`,
        };
      }
      if (!meta.license && !meta.licenseClassifiers.length && cached) {
        meta = {
          license: cached.license,
          licenseExpression: cached.licenseExpression ?? null,
          licenseClassifiers: cached.licenseClassifiers ?? [],
          homePage: cached.homePage ?? null,
          status: `${cached.evidence ?? 'cached'} (cache fallback)`,
        };
      }
    }
    const field = (meta.licenseExpression || meta.license || '').trim();
    const classifier = (meta.licenseClassifiers ?? []).join('; ');
    python[position] = {
      name: row.name,
      version: row.version,
      license: field || null,
      licenseExpression: meta.licenseExpression ?? null,
      licenseClassifiers: meta.licenseClassifiers ?? [],
      evidence: field ? meta.status : (classifier ? `${meta.status} (classifier-only)` : meta.status),
      homePage: meta.homePage,
      sourceUrl: `https://pypi.org/project/${encodeURIComponent(row.name)}/${encodeURIComponent(row.version)}/`,
      direct: declaredNames.has(normalize(row.name)),
    };
  }));
}
python.sort((a, b) => normalize(a.name).localeCompare(normalize(b.name)));

const pythonMissing = python.filter((row) => !row.license && !row.licenseClassifiers.length);
const pythonDirect = python.filter((row) => row.direct);
const pythonCounts = {};
for (const row of python) {
  const shown = row.license ?? (row.licenseClassifiers.length ? `classifier-only: ${row.licenseClassifiers.join('; ')}` : 'UNKNOWN');
  pythonCounts[shown] = (pythonCounts[shown] ?? 0) + 1;
}

// ---------------------------------------------------------------------------
// Bundled runtimes, fonts, and the optional local model catalog
// ---------------------------------------------------------------------------
const localAiDir = resolve(root, 'apps/desktop/vendor/local-ai');
const runtimeLock = readJson(resolve(localAiDir, 'runtime-lock.json'), { version: null, assets: [] });
const electronRow = npm.find((row) => row.lockPath === 'node_modules/electron');
const bundled = [];

if (runtimeLock.version) {
  bundled.push({
    component: 'llama.cpp runtime (CPU and Vulkan)',
    version: runtimeLock.version,
    files: (runtimeLock.assets ?? []).map((asset) => `apps/desktop/vendor/local-ai/${asset.archive}`),
    license: 'MIT',
    source: 'https://github.com/ggml-org/llama.cpp',
    evidence: 'apps/desktop/vendor/local-ai/LICENSE-llama.cpp; archive SHA-256 pinned in runtime-lock.json',
    sha256: (runtimeLock.assets ?? []).map((asset) => asset.sha256),
  });
  bundled.push({
    component: 'LLVM OpenMP runtime (libomp.dll)',
    version: `shipped inside llama.cpp ${runtimeLock.version} archives`,
    files: (runtimeLock.assets ?? []).map((asset) => `apps/desktop/vendor/local-ai/${asset.archive} -> libomp.dll`),
    license: 'Apache-2.0 WITH LLVM-exception',
    source: 'https://llvm.org/',
    evidence: 'LICENSE-LLVM-OpenMP inside each llama.cpp archive; not extracted into the repository tree',
    sha256: [],
  });
}
if (electronRow) {
  bundled.push({
    component: 'CastLabs Electron shell',
    version: electronRow.version,
    files: ['Electron runtime shipped with the desktop app'],
    license: electronRow.license ?? 'MIT',
    source: 'https://github.com/castlabs/electron-releases',
    evidence: 'apps/desktop/package.json devDependencies plus package-lock.json entry node_modules/electron',
    sha256: [],
  });
}

const fonts = [
  {
    font: 'Atkinson Hyperlegible',
    files: 'apps/desktop/src/renderer/assets/fonts/Atkinson-Hyperlegible-*.woff2',
    license: 'OFL-1.1',
    source: 'https://github.com/googlefonts/atkinson-hyperlegible',
    evidence: 'A-020 audit section 4.4; no license text stored in the repository tree',
  },
  {
    font: 'Lexend',
    files: 'apps/desktop/src/renderer/assets/fonts/Lexend-*.woff2',
    license: 'OFL-1.1',
    source: 'https://github.com/googlefonts/lexend',
    evidence: 'A-020 audit section 4.4; no license text stored in the repository tree',
  },
  {
    font: 'OpenDyslexic',
    files: 'apps/desktop/src/renderer/assets/fonts/OpenDyslexic-*.woff2',
    license: 'OFL-1.1',
    source: 'https://github.com/antijingoist/opendyslexic',
    evidence: 'apps/desktop/src/renderer/assets/fonts/OpenDyslexic-OFL.txt and OpenDyslexic-SOURCE.txt; pinned revision in SOURCE.txt',
  },
  {
    font: 'Inter',
    files: 'lastbrowser.com/assets/fonts/inter-var.woff2',
    license: 'OFL-1.1',
    source: 'https://github.com/rsms/inter',
    evidence: 'A-020 audit section 4.4; no license text stored in the repository tree',
  },
  {
    font: 'Outfit',
    files: 'lastbrowser.com/assets/fonts/outfit-var.woff2',
    license: 'OFL-1.1',
    source: 'https://github.com/Outfitio/Outfit-Fonts',
    evidence: 'A-020 audit section 4.4; no license text stored in the repository tree',
  },
  {
    font: 'KaTeX fonts',
    files: 'services/sidekick/web/static/vendor/katex/fonts/*',
    license: 'OFL-1.1',
    source: 'https://github.com/KaTeX/KaTeX',
    evidence: 'A-020 audit section 4.4; KaTeX code is MIT, bundled font files are OFL-1.1; no license text stored in the repository tree',
  },
];

const webVendored = [
  {
    component: 'streaming-markdown (smd.min.js)',
    version: '0.2.15',
    files: 'services/sidekick/web/static/vendor/smd.min.js',
    license: 'MIT',
    source: 'https://github.com/thetarnav/streaming-markdown',
    evidence: 'services/sidekick/web/static/index.html pins npm version and records sha384 T6r95ocN9t3W8tUK2Fa6FPaO7bJryyjyW0WCalrUnpgtm2qXr5xcN4vwPYEJ6vHa',
  },
  {
    component: 'Prism.js',
    version: '1.29.0',
    files: 'services/sidekick/web/static/vendor/prism/**',
    license: 'MIT',
    source: 'https://github.com/PrismJS/prism',
    evidence: 'services/sidekick/web/static/index.html comment pins npm:prismjs@1.29.0; license metadata from npm registry',
  },
  {
    component: 'xterm.js and addons',
    version: '5.3.0',
    files: 'services/sidekick/web/static/vendor/xterm/** and services/sidekick/web/static/xterm.css',
    license: 'MIT',
    source: 'https://github.com/xtermjs/xterm.js',
    evidence: 'services/sidekick/web/static/index.html comment pins npm:xterm@5.3.0; xterm.css carries the MIT notice',
  },
  {
    component: 'KaTeX',
    version: '0.16.22',
    files: 'services/sidekick/web/static/vendor/katex/katex.min.js and katex.min.css',
    license: 'MIT (code); bundled fonts OFL-1.1',
    source: 'https://github.com/KaTeX/KaTeX',
    evidence: 'services/sidekick/web/static/index.html comment pins npm:katex@0.16.22; font license listed separately under Schriften',
  },
  {
    component: 'js-yaml',
    version: '4.1.0',
    files: 'services/sidekick/web/static/vendor/js-yaml/js-yaml.min.js',
    license: 'MIT',
    source: 'https://github.com/nodeca/js-yaml',
    evidence: 'Bundled file header: js-yaml 4.1.0, @license MIT',
  },
  {
    component: 'Mermaid',
    version: '10.9.3',
    files: 'services/sidekick/web/static/vendor/mermaid/mermaid.min.js',
    license: 'MIT',
    source: 'https://github.com/mermaid-js/mermaid',
    evidence: 'services/sidekick/docs/webui-performance-backlog.md item 14 records Mermaid 10.9.3; license metadata from npm registry',
  },
  {
    component: 'pdfjs-dist',
    version: '4.9.155',
    files: 'services/sidekick/web/static/vendor/pdfjs/pdf.min.mjs and pdf.worker.min.mjs',
    license: 'Apache-2.0',
    source: 'https://github.com/mozilla/pdf.js',
    evidence: 'services/sidekick/docs/webui-performance-backlog.md item 14 records pdfjs-dist 4.9.155; Apache-2.0 notice in the bundled file header',
  },
];

const iconDir = resolve(root, 'services/sidekick/web/static/icons');
const countIcons = (folder) => {
  try {
    return readdirSync(resolve(iconDir, folder)).filter((file) => file.endsWith('.svg')).length;
  } catch {
    return 0;
  }
};
const iconSets = [
  {
    set: 'Skill Icons',
    files: `services/sidekick/web/static/icons/si/*.svg (${countIcons('si')} files)`,
    license: 'MIT',
    source: 'https://github.com/tandpfun/skill-icons',
    evidence: 'loader mapping in services/sidekick/web/static/icons.js; license metadata from npm registry',
    note: 'Brand logos remain trademarks of their respective owners.',
  },
  {
    set: 'Devicon',
    files: `services/sidekick/web/static/icons/di/*.svg (${countIcons('di')} files)`,
    license: 'MIT',
    source: 'https://github.com/devicons/devicon',
    evidence: 'loader mapping in services/sidekick/web/static/icons.js; license metadata from npm registry',
    note: 'Brand logos remain trademarks of their respective owners.',
  },
  {
    set: 'Phosphor Icons',
    files: `services/sidekick/web/static/icons/ph/*.svg (${countIcons('ph')} files)`,
    license: 'MIT',
    source: 'https://github.com/phosphor-icons/core',
    evidence: 'loader mapping in services/sidekick/web/static/icons.js; license metadata from npm registry',
    note: '',
  },
  {
    set: 'Fluent Emoji Flat',
    files: `services/sidekick/web/static/icons/fe/*.svg (${countIcons('fe')} files)`,
    license: 'MIT',
    source: 'https://github.com/microsoft/fluentui-emoji',
    evidence: 'loader mapping in services/sidekick/web/static/icons.js; license metadata from npm registry',
    note: '',
  },
  {
    set: 'Lucide (inline SVG paths)',
    files: 'services/sidekick/web/static/icons.js',
    license: 'ISC',
    source: 'https://github.com/lucide-icons/lucide',
    evidence: 'inline LI_PATHS table in services/sidekick/web/static/icons.js; license metadata from npm registry',
    note: '',
  },
];

const modelsFile = readJson(resolve(localAiDir, 'models.json'), []);
const modelLicenseFile = (repository) => {
  if (String(repository).startsWith('LiquidAI/')) return 'apps/desktop/vendor/local-ai/LICENSE-LFM';
  if (String(repository).startsWith('Qwen/')) return 'apps/desktop/vendor/local-ai/LICENSE-Qwen';
  return null;
};
const modelLicenseLabel = (model) => {
  const raw = String(model.license ?? '').toLowerCase();
  if (raw === 'apache-2.0') return 'Apache-2.0';
  if (raw === 'other' && String(model.repository).startsWith('LiquidAI/')) return 'LFM Open License v1.0';
  return model.license ?? 'UNKNOWN';
};
const localModels = modelsFile.map((model) => ({
  id: model.id,
  name: model.name,
  repository: model.repository,
  revision: model.revision,
  license: modelLicenseLabel(model),
  licenseFile: modelLicenseFile(model.repository),
  source: model.url,
  bytes: model.bytes,
  sha256: model.sha256,
  distributed: false,
  note: 'Catalog entry only. The model file is downloaded after an explicit user action and is not part of the installer payload.',
}));

const joPath = resolve(root, 'services/sidekick/tools/neutts_samples/jo.wav');
const joBytes = readFileSync(joPath);
const jo = {
  path: 'services/sidekick/tools/neutts_samples/jo.wav',
  bytes: joBytes.length,
  sha256: createHash('sha256').update(joBytes).digest('hex'),
  license: null,
  note: 'No license file beside jo.wav or jo.txt. jo.txt is a Neuphonic product blurb, not a grant. Status: unknown.',
};

// ---------------------------------------------------------------------------
// Machine-readable output
// ---------------------------------------------------------------------------
const generatedAt = new Date().toISOString();
const payload = {
  generatedAt,
  sources: {
    npm: 'package-lock.json packages, including nested node_modules, license and resolved fields',
    npmDirect: 'apps/desktop/package.json dependencies and devDependencies, matched to top-level lockfile entries',
    python: 'apps/desktop/scripts/requirements-runtime.txt plus PyPI JSON license / license_expression',
    pythonDirect: 'dependency strings and build-system.requires in services/sidekick/pyproject.toml',
    bundled: 'apps/desktop/vendor/local-ai/runtime-lock.json, bundled license files, apps/desktop/package.json',
    fonts: 'repository paths plus A-020 audit section 4.4 and in-tree license evidence',
    webVendored: 'self-hosted files under services/sidekick/web/static/vendor plus version pins in index.html and docs/webui-performance-backlog.md',
    iconSets: 'self-hosted SVG sets under services/sidekick/web/static/icons plus the loader mapping in icons.js',
    localModels: 'apps/desktop/vendor/local-ai/models.json plus bundled model license files',
  },
  npm: {
    count: npm.length,
    nestedCount: npm.filter((row) => row.nested).length,
    uniqueNames: new Set(npm.map((row) => row.name)).size,
    missingLicense: npmMissing.length,
    missingDirect,
    directCount: npmDirect.length,
    directDependencyNames: [...direct.keys()].sort((a, b) => a.localeCompare(b)),
    skipped: npmSkipped,
    counts: npmCounts,
    packages: npm,
  },
  pythonRuntime: {
    count: python.length,
    directCount: pythonDirect.length,
    missingLicense: pythonMissing.map((row) => row.name),
    declarationsWithoutPin: declaredNotPinned,
    counts: pythonCounts,
    previousGeneratedAt,
    packages: python,
  },
  bundled,
  fonts,
  webVendored,
  iconSets,
  localModels,
  joWav: jo,
};

writeFileSync(resolve(outDir, 'dependency-licenses.json'), `${JSON.stringify(payload, null, 2)}\n`);

// ---------------------------------------------------------------------------
// Reviewable Markdown output
// ---------------------------------------------------------------------------
const lines = [];
const table = (headers, rows) => {
  lines.push(`| ${headers.join(' | ')} |`);
  lines.push(`| ${headers.map(() => ':---').join(' | ')} |`);
  for (const row of rows) lines.push(`| ${row.map(mdCell).join(' | ')} |`);
  lines.push('');
};
const pythonLicenseShown = (row) =>
  row.license ?? (row.licenseClassifiers.length ? `${row.licenseClassifiers.join('; ')} (classifier only)` : 'UNKNOWN');
const sourceLink = (url) => {
  if (!url) return 'not recorded';
  if (url.startsWith('git+')) return `\`${url}\``;
  return `[source](${url})`;
};

lines.push('# Lizenz-Inventar der Abhängigkeiten (A-022)');
lines.push('');
lines.push(`Stand: ${generatedAt}`);
lines.push('');
lines.push('Erzeugt mit `node scripts/legal-inventory.mjs` im Repository-Root. Das Inventar ist eine technische Bestandsaufnahme, keine rechtliche Freigabe. Eine fehlende Lizenzangabe bedeutet **unbekannt**, nicht kompatibel.');
lines.push('');
lines.push('## Erfassungsgrenzen und Quellen');
lines.push('');
lines.push('- **npm:** jeder Nicht-Link-Eintrag unter `node_modules` in `package-lock.json`, inklusive verschachtelter Einträge. Maßgeblich sind die Felder `license` und `resolved` des Lockfiles. Die Zählung ist Lockfile-Einträge, nicht eindeutige Paketnamen.');
lines.push('- **Direkt:** ein Eintrag gilt als direkt, wenn sein Lockfile-Pfad exakt `node_modules/<name>` ist und der Name in `apps/desktop/package.json` unter `dependencies` oder `devDependencies` steht.');
lines.push('- **Python:** die gepinnten Pakete der Windows-Laufzeit in `apps/desktop/scripts/requirements-runtime.txt`. Die Lizenzangabe stammt aus den PyPI-Metadaten (`license` oder `license_expression`) für genau diese Version; reine Classifier werden als solche gekennzeichnet.');
lines.push('- **Python direkt:** Namen aus den Dependency-Strings und `build-system.requires` in `services/sidekick/pyproject.toml`. Namen ohne Pin erhalten keine Versions- oder Lizenzaussage.');
lines.push('- **Gebündelte Bestandteile, Web-Assets, Schriften, Icon-Sets und Modelle:** separat unten mit Pfad, Quelle und Beleg im Tree. Nicht im Installer gebündelte Komponenten sind als solche markiert.');
lines.push('- Vollständige Lockfile-Pfade und SHA-256-Werte stehen in `docs/legal/inventory/dependency-licenses.json`.');
lines.push('');
lines.push('## Abdeckung');
lines.push('');
table(
  ['Quelle', 'Einträge', 'Direkt', 'Ohne Lizenzangabe'],
  [
    ['npm-Lockfile', npm.length, npmDirect.length, npmMissing.length],
    ['Python-Laufzeit', python.length, pythonDirect.length, pythonMissing.length],
    ['Gebündelte Laufzeiten', bundled.length, 'n/a', 0],
    ['Schriften', fonts.length, 'n/a', 0],
    ['Gebündelte Web-Assets', webVendored.length, 'n/a', 0],
    ['Icon-Sets', iconSets.length, 'n/a', 0],
    ['Lokaler Modellkatalog', localModels.length, 'n/a', 0],
  ],
);
lines.push(`Verschachtelte npm-Einträge: ${npm.filter((row) => row.nested).length}. Eindeutige npm-Namen: ${new Set(npm.map((row) => row.name)).size}. Übersprungene Workspace-Links: ${npmSkipped.length}.`);
lines.push('');
if (missingDirect.length) {
  lines.push(`Direkte npm-Abhängigkeiten ohne Lockfile-Eintrag: ${missingDirect.join(', ')}.`);
  lines.push('');
}

lines.push('## Direkte npm-Abhängigkeiten');
lines.push('');
lines.push('Die Version ist die im Lockfile aufgelöste Version, nicht die Bereichsangabe in `package.json`.');
lines.push('');
table(
  ['Paket', 'Bereich', 'Version', 'Lizenz', 'Abschnitt', 'Quelle'],
  npmDirect.map((row) => [
    row.name,
    row.declaredRange,
    row.version,
    row.license ?? 'UNKNOWN',
    row.directSection,
    sourceLink(row.resolved),
  ]),
);

lines.push('## npm-Lizenzverteilung');
lines.push('');
table(
  ['Lizenzfeld im Lockfile', 'Einträge'],
  Object.entries(npmCounts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])),
);

lines.push('## Alle npm-Lockfile-Einträge');
lines.push('');
lines.push('Alphabetisch nach Lockfile-Pfad. `direkt` bezieht sich auf die oberste Ebene; `transitiv` umfasst auch verschachtelte Einträge. Die Spalte `dev` folgt dem Lockfile-Feld und ist nur ein Hinweis auf den Installationsgraphen, keine Aussage über die Verbreitung.');
lines.push('');
table(
  ['Paket', 'Version', 'Lizenz', 'Art', 'dev', 'Quelle'],
  npm.map((row) => [
    row.name,
    row.version,
    row.license ?? 'UNKNOWN',
    row.direct ? `direkt (${row.directSection})` : (row.nested ? 'transitiv (verschachtelt)' : 'transitiv'),
    row.dev ? 'ja' : 'nein',
    sourceLink(row.resolved),
  ]),
);

lines.push('## Python-Laufzeit (Windows, gepinnt)');
lines.push('');
lines.push('Die Spalte `direkt` bezieht sich auf die Deklaration in `services/sidekick/pyproject.toml`, nicht auf die Ebene im Installationsgraphen.');
lines.push('');
table(
  ['Paket', 'Version', 'Lizenz', 'direkt', 'Beleg', 'Quelle'],
  python.map((row) => [
    row.name,
    row.version,
    pythonLicenseShown(row),
    row.direct ? 'ja' : 'nein',
    row.evidence,
    sourceLink(row.sourceUrl),
  ]),
);

lines.push('## Python-Lizenzverteilung');
lines.push('');
table(
  ['Lizenzangabe', 'Pakete'],
  Object.entries(pythonCounts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])),
);

lines.push('## Python-Namen ohne Pin');
lines.push('');
lines.push('Diese Namen stehen in `services/sidekick/pyproject.toml`, fehlen aber in der gepinnten Laufzeitdatei. Ohne Version wird keine Lizenz behauptet.');
lines.push('');
for (const name of declaredNotPinned) lines.push(`- ${name}`);
lines.push('');

lines.push('## Gebündelte Laufzeiten und Binärdateien');
lines.push('');
table(
  ['Komponente', 'Version', 'Dateien', 'Lizenz', 'Quelle', 'Beleg'],
  bundled.map((row) => [
    row.component,
    row.version,
    row.files.join('<br>'),
    row.license,
    sourceLink(row.source),
    row.evidence,
  ]),
);
lines.push('Widevine CDM ist proprietäre Drittsoftware von Google. Sie liegt nicht im Repository und wird nicht mit dem Installer gebündelt, sondern zur Laufzeit über die CastLabs-Electron-Schicht geladen. Sie ist deshalb kein Eintrag dieses Inventars.');
lines.push('');

lines.push('## Schriften');
lines.push('');
table(
  ['Schrift', 'Dateien', 'Lizenz', 'Quelle', 'Beleg'],
  fonts.map((row) => [row.font, row.files, row.license, sourceLink(row.source), row.evidence]),
);

lines.push('## Gebündelte Web-Assets der Sidekick-Oberfläche');
lines.push('');
lines.push('Diese Dateien werden mit `services/**/*` als Electron-`extraResources` ausgeliefert. Die Versionsangaben stammen aus den Pins in `services/sidekick/web/static/index.html` oder aus `services/sidekick/docs/webui-performance-backlog.md` (Backlog-Item 14).');
lines.push('');
table(
  ['Komponente', 'Version', 'Dateien', 'Lizenz', 'Quelle', 'Beleg'],
  webVendored.map((row) => [
    row.component,
    row.version,
    row.files,
    row.license,
    sourceLink(row.source),
    row.evidence,
  ]),
);

lines.push('## Icon-Sets');
lines.push('');
lines.push('Alle Sets liegen als einzelne SVG-Dateien unter `services/sidekick/web/static/icons/` und werden über `icons.js` geladen.');
lines.push('');
table(
  ['Set', 'Dateien', 'Lizenz', 'Quelle', 'Beleg', 'Hinweis'],
  iconSets.map((row) => [
    row.set,
    row.files,
    row.license,
    sourceLink(row.source),
    row.evidence,
    row.note,
  ]),
);

lines.push('## Lokaler Modellkatalog (optional, nutzergeladen)');
lines.push('');
lines.push('Die Modelle stehen im Katalog `apps/desktop/vendor/local-ai/models.json`, werden aber erst nach einer ausdrücklichen Nutzeraktion geladen und sind nicht Teil des Installer-Payloads. Das Feld `license` in `models.json` ist Metadaten; maßgeblich ist die beigelegte Lizenzdatei.');
lines.push('');
table(
  ['Modell', 'Repository', 'Revision', 'Lizenz', 'Lizenzdatei', 'Quelle'],
  localModels.map((row) => [
    row.name,
    row.repository,
    row.revision,
    row.license,
    row.licenseFile ?? 'nicht zugeordnet',
    sourceLink(row.source),
  ]),
);
lines.push('Hinweis: Das LFM-Modell steht unter der LFM Open License v1.0. Diese Lizenz ist nicht OSI-anerkannt und enthält eine Commercial-Use-Schwelle. Eine Aussage zur GPL-3.0-Kompatibilität oder zur Weitergabe trifft dieses Inventar nicht.');
lines.push('');

lines.push('## Ungeklärte Bestandteile');
lines.push('');
table(
  ['Bestandteil', 'Pfad', 'Status', 'Beleg'],
  [
    ['NeuTTS-Sample-Audio', jo.path, 'Lizenz unbekannt', `SHA-256 \`${jo.sha256}\`, ${jo.bytes} Bytes; keine Lizenzdatei`],
  ],
);
lines.push('`jo.wav` bleibt offen. Die danebenliegende Datei `jo.txt` ist ein Neuphonic-Werbetext und keine Lizenzgewährung.');
lines.push('');
lines.push('## Nicht Teil dieses Inventars');
lines.push('');
lines.push('- Die Herkunfts- und Rechtekette des Sidekick-/Nous-Codes (`services/sidekick/LICENSE`, MIT). Sie ist Gegenstand von A-020 Abschnitt 3 und kein Eintrag einer Drittanbieter-Abhängigkeit.');
lines.push('- Die rechtliche Bewertung der GPL-3.0-Kompatibilität. Diese steht in `docs/legal/license-audit.md` (A-020).');
lines.push('- Die Drittanbieter-Datei und die Lizenzseite in der App. Beides folgt in A-022 (b).');
lines.push('');

writeFileSync(resolve(outDir, 'dependency-licenses.md'), `${lines.join('\n')}\n`);

console.log(JSON.stringify({
  generatedAt,
  npm: npm.length,
  npmNested: npm.filter((row) => row.nested).length,
  npmUniqueNames: new Set(npm.map((row) => row.name)).size,
  npmDirect: npmDirect.length,
  npmSkipped,
  npmMissing: npmMissing.length,
  missingDirect,
  python: python.length,
  pythonDirect: pythonDirect.length,
  pythonMissing: pythonMissing.map((row) => row.name),
  declaredNotPinned,
  bundled: bundled.map((row) => row.component),
  fonts: fonts.length,
  webVendored: webVendored.map((row) => `${row.component}@${row.version}: ${row.license}`),
  iconSets: iconSets.map((row) => `${row.set}: ${row.license}`),
  localModels: localModels.map((row) => `${row.id}: ${row.license}`),
  mcp: python.find((row) => normalize(row.name) === 'mcp'),
}, null, 2));
