import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import yaml from 'js-yaml';

const args = process.argv.slice(2);
const checkOnly = args.includes('--check');
const positional = args.filter((arg) => arg !== '--check');
if (positional.length !== 1) {
  console.error('Usage: node scripts/generate-sha256sums.mjs <releaseDir> [--check]');
  process.exit(2);
}

const releaseDir = path.resolve(positional[0]);
const metadataPath = path.join(releaseDir, 'latest.yml');
const sumsPath = path.join(releaseDir, 'SHA256SUMS');

const metadata = yaml.load(await readFile(metadataPath, 'utf8'));
if (!metadata || typeof metadata !== 'object' || typeof metadata.version !== 'string'
  || !/^\d+\.\d+\.\d+$/.test(metadata.version)) {
  throw new Error(`Invalid electron-updater metadata: ${metadataPath}`);
}

const setupName = `Lastbrowser-${metadata.version}-x64-setup.exe`;
const portableName = `Lastbrowser-${metadata.version}-x64-portable.exe`;
// Sorted, relative asset names: GNU coreutils `sha256sum -c` compatible, no self-entry.
const expectedNames = [setupName, `${setupName}.blockmap`, portableName, 'latest.yml'].sort();

async function hashFile(filePath) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest('hex');
}

function parseSums(content) {
  const entries = new Map();
  for (const line of content.split('\n')) {
    if (line === '') continue;
    const match = /^([0-9a-f]{64}) {2}(.+)$/.exec(line);
    if (!match) throw new Error(`Malformed SHA256SUMS line: ${line}`);
    if (entries.has(match[2])) throw new Error(`Duplicate SHA256SUMS entry: ${match[2]}`);
    entries.set(match[2], match[1]);
  }
  return entries;
}

const expectedEntries = [];
for (const name of expectedNames) {
  expectedEntries.push({ name, hash: await hashFile(path.join(releaseDir, name)) });
}
const expectedContent = `${expectedEntries.map(({ name, hash }) => `${hash}  ${name}`).join('\n')}\n`;

if (!checkOnly) {
  await writeFile(sumsPath, expectedContent, 'utf8');
}

const written = parseSums(await readFile(sumsPath, 'utf8'));
if (written.size !== expectedEntries.length) {
  throw new Error(`SHA256SUMS must list exactly ${expectedEntries.length} assets; found ${written.size}`);
}
for (const { name, hash } of expectedEntries) {
  const recorded = written.get(name);
  if (recorded === undefined) throw new Error(`SHA256SUMS is missing ${name}`);
  if (recorded !== hash) throw new Error(`SHA256SUMS hash mismatch for ${name}: recorded ${recorded}, actual ${hash}`);
}

console.log(`${checkOnly ? 'Verified' : 'Wrote'} SHA256SUMS for ${expectedEntries.length} assets in ${releaseDir}`);
for (const { name, hash } of expectedEntries) console.log(`${hash}  ${name}`);
