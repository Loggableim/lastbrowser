import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import yaml from 'js-yaml';

const EXIT_OK = 0;
const EXIT_USAGE = 1;
const EXIT_MANIFEST = 2;
const EXIT_MISMATCH = 3;

function fail(code, message) {
  console.error(`[sha256sums] ${message}`);
  process.exit(code);
}

const args = process.argv.slice(2);
const verifyOnly = args.includes('--verify');
const positional = args.filter((argument) => argument !== '--verify');
if (positional.length > 1) {
  fail(EXIT_USAGE, 'Usage: node scripts/generate-sha256sums.mjs <releaseDir> [--verify]');
}
const releaseDir = path.resolve(positional[0] || 'apps/desktop/release');
const metadataPath = path.join(releaseDir, 'latest.yml');
const sumsPath = path.join(releaseDir, 'SHA256SUMS');

let metadata = null;
try {
  metadata = yaml.load(await readFile(metadataPath, 'utf8'));
} catch (error) {
  fail(EXIT_MANIFEST, `Cannot read ${metadataPath}: ${error.message}`);
}

if (!metadata || typeof metadata !== 'object' || !Array.isArray(metadata.files)
  || typeof metadata.version !== 'string' || !/^\d+\.\d+\.\d+$/.test(metadata.version)) {
  fail(EXIT_MANIFEST, `Invalid electron-updater metadata: ${metadataPath}`);
}

// The publishable asset set is derived from the signed release manifest so the
// checksum list can never drift from the executables electron-updater serves.
const assetNames = new Set(['latest.yml']);
for (const file of metadata.files) {
  if (!file || typeof file.url !== 'string' || file.url.length === 0) {
    fail(EXIT_MANIFEST, 'latest.yml contains a file entry without a url');
  }
  if (path.basename(file.url) !== file.url) {
    fail(EXIT_MANIFEST, `latest.yml url must be a bare filename: ${file.url}`);
  }
  assetNames.add(file.url);
}
if (typeof metadata.path === 'string' && metadata.path.length > 0) {
  if (path.basename(metadata.path) !== metadata.path) {
    fail(EXIT_MANIFEST, `latest.yml update path must be a bare filename: ${metadata.path}`);
  }
  assetNames.add(`${metadata.path}.blockmap`);
}
const names = [...assetNames].sort();

async function sha256(filePath) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest('hex');
}

async function collect() {
  const entries = [];
  for (const name of names) {
    const filePath = path.join(releaseDir, name);
    let info;
    try {
      info = await stat(filePath);
    } catch {
      fail(EXIT_MANIFEST, `Missing release asset: ${name}`);
    }
    if (!info.isFile()) {
      fail(EXIT_MANIFEST, `Release asset is not a file: ${name}`);
    }
    entries.push({ name, hash: await sha256(filePath) });
  }
  return entries;
}

// GNU coreutils format (`<hex>  <name>`), so `sha256sum -c SHA256SUMS` verifies
// the list on any POSIX host without this script.
function format(entries) {
  return entries.map(({ hash, name }) => `${hash}  ${name}`).join('\n') + '\n';
}

function parseSums(text) {
  const entries = new Map();
  for (const line of text.split('\n')) {
    if (line === '') continue;
    const match = /^([0-9a-f]{64}) {2}(.+)$/.exec(line);
    if (!match) {
      fail(EXIT_MANIFEST, `Malformed SHA256SUMS line: ${line}`);
    }
    if (entries.has(match[2])) {
      fail(EXIT_MANIFEST, `Duplicate SHA256SUMS entry: ${match[2]}`);
    }
    entries.set(match[2], match[1]);
  }
  return entries;
}

function compare(recorded, actual) {
  const differences = [];
  for (const { name, hash } of actual) {
    if (!recorded.has(name)) differences.push(`missing entry: ${name}`);
    else if (recorded.get(name) !== hash) differences.push(`hash mismatch: ${name}`);
  }
  for (const name of recorded.keys()) {
    if (!actual.some((entry) => entry.name === name)) differences.push(`unexpected entry: ${name}`);
  }
  return differences;
}

if (verifyOnly) {
  let recorded;
  try {
    recorded = parseSums(await readFile(sumsPath, 'utf8'));
  } catch (error) {
    fail(EXIT_MANIFEST, `Cannot read ${sumsPath}: ${error.message}`);
  }
  const actual = await collect();
  const differences = compare(recorded, actual);
  if (differences.length > 0) {
    for (const difference of differences) console.error(`[sha256sums] ${difference}`);
    fail(EXIT_MISMATCH, `SHA256SUMS verification failed for ${releaseDir}`);
  }
  console.log(`[sha256sums] verified ${actual.length} assets in ${sumsPath}`);
  process.exit(EXIT_OK);
}

const entries = await collect();
await writeFile(sumsPath, format(entries), 'utf8');
const reread = parseSums(await readFile(sumsPath, 'utf8'));
const differences = compare(reread, entries);
if (differences.length > 0) {
  for (const difference of differences) console.error(`[sha256sums] ${difference}`);
  fail(EXIT_MISMATCH, `Post-write verification of ${sumsPath} failed`);
}
console.log(`[sha256sums] wrote ${sumsPath} for ${entries.length} assets (version ${metadata.version})`);
process.exit(EXIT_OK);
