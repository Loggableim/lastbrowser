/**
 * Write SHA-256 checksums for Linux package artifacts.
 *
 * GPG is prepared, not executed. The signing key stays with the release owner.
 * After this script, sign with:
 *   gpg --detach-sign --armor --output SHA256SUMS.asc SHA256SUMS
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const ARTIFACT = /\.(tar\.gz|AppImage)$/;
const GPG_COMMAND = 'gpg --detach-sign --armor --output SHA256SUMS.asc SHA256SUMS\n';

export function checksumLines(directory) {
  const names = readdirSync(directory)
    .filter((name) => ARTIFACT.test(name))
    .sort();
  return names.map((name) => {
    const file = path.join(directory, name);
    if (!statSync(file).isFile()) return null;
    const hash = createHash('sha256').update(readFileSync(file)).digest('hex');
    return `${hash}  ${name}`;
  }).filter(Boolean);
}

export function writeChecksums(directory) {
  const lines = checksumLines(directory);
  if (!lines.length) {
    throw new Error(`No Linux artifacts in ${directory}`);
  }
  const sums = path.join(directory, 'SHA256SUMS');
  writeFileSync(sums, `${lines.join('\n')}\n`);
  writeFileSync(path.join(directory, 'SHA256SUMS.gpg-command'), GPG_COMMAND);
  return { sums, count: lines.length };
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (isDirectRun) {
  const directory = path.resolve(process.argv[2] || 'release');
  const result = writeChecksums(directory);
  console.log(`SHA256SUMS ${result.count} ${result.sums}`);
  console.log(GPG_COMMAND.trim());
}
