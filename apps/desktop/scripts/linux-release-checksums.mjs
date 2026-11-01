#!/usr/bin/env node
/**
 * Writes SHA256SUMS for the Linux release artifacts (AppImage + tar.gz) and
 * creates a detached, armored GPG signature SHA256SUMS.asc.
 *
 * Usage:
 *   node scripts/linux-release-checksums.mjs [releaseDir] [--allow-unsigned]
 *
 * Signing key (required unless --allow-unsigned):
 *   LASTBROWSER_GPG_KEY_ID   key id / fingerprint / email used with `gpg --local-user`
 *   GNUPGHOME                optional, standard gpg home override
 * The passphrase is never read by this script; gpg-agent / pinentry handles it.
 * Keys and passphrases must never be committed. Signing is performed locally by the
 * release maintainer, not in CI.
 */
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const ARTIFACT_PATTERN = /^Lastbrowser-.+\.(AppImage|tar\.gz)$/;
export const SUMS_FILE = 'SHA256SUMS';
export const SIG_FILE = 'SHA256SUMS.asc';

export function selectArtifacts(fileNames) {
  return fileNames.filter((name) => ARTIFACT_PATTERN.test(name)).sort();
}

export function hashFile(filePath) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);
    stream.on('error', reject);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

/** Formats lines in the coreutils `sha256sum` layout: "<hex>  <name>\n". */
export function formatSha256Sums(entries) {
  return entries.map(({ name, sha256 }) => `${sha256}  ${name}`).join('\n') + '\n';
}

export function resolveSigningKey(env, { allowUnsigned }) {
  const keyId = env.LASTBROWSER_GPG_KEY_ID?.trim();
  if (keyId) return keyId;
  if (allowUnsigned) return null;
  throw new Error(
    '[linux-release] LASTBROWSER_GPG_KEY_ID is not set. Refusing to produce an unsigned release. ' +
      'Set the key id, or pass --allow-unsigned for a local test build (do not publish it).'
  );
}

export async function writeChecksums(releaseDir, { deps = {} } = {}) {
  const fsDeps = {
    readdir: deps.readdir ?? readdir,
    hashFile: deps.hashFile ?? hashFile,
    writeFile: deps.writeFile ?? writeFile
  };
  const names = selectArtifacts(await fsDeps.readdir(releaseDir));
  if (names.length === 0) {
    throw new Error(`[linux-release] No Lastbrowser AppImage or tar.gz found in ${releaseDir}`);
  }
  const entries = [];
  for (const name of names) {
    entries.push({ name, sha256: await fsDeps.hashFile(path.join(releaseDir, name)) });
  }
  const sumsPath = path.join(releaseDir, SUMS_FILE);
  await fsDeps.writeFile(sumsPath, formatSha256Sums(entries), 'utf8');
  return { sumsPath, entries };
}

export function signChecksums(releaseDir, keyId, { run = spawnSync } = {}) {
  const sumsPath = path.join(releaseDir, SUMS_FILE);
  const sigPath = path.join(releaseDir, SIG_FILE);
  const sign = run(
    'gpg',
    ['--batch', '--yes', '--armor', '--detach-sign', '--local-user', keyId, '--output', sigPath, sumsPath],
    { stdio: 'inherit' }
  );
  if (sign.error || sign.status !== 0) {
    throw new Error(`[linux-release] gpg signing failed (exit ${sign.status ?? 'n/a'})`);
  }
  const verify = run('gpg', ['--batch', '--verify', sigPath, sumsPath], { stdio: 'inherit' });
  if (verify.error || verify.status !== 0) {
    throw new Error('[linux-release] gpg verification of SHA256SUMS.asc failed');
  }
  return sigPath;
}

export async function main(argv, env = process.env, { log = console.log } = {}) {
  const allowUnsigned = argv.includes('--allow-unsigned');
  const positional = argv.filter((arg) => !arg.startsWith('--'));
  const releaseDir = path.resolve(positional[0] ?? 'release');
  // Fail before hashing anything if no signing key is configured.
  const keyId = resolveSigningKey(env, { allowUnsigned });

  const { sumsPath, entries } = await writeChecksums(releaseDir);
  for (const entry of entries) log(`[linux-release] ${entry.sha256}  ${entry.name}`);
  log(`[linux-release] wrote ${sumsPath}`);

  if (keyId) {
    const sigPath = signChecksums(releaseDir, keyId);
    log(`[linux-release] signed ${sumsPath} -> ${sigPath} (key ${keyId})`);
  } else {
    log('[linux-release] WARNING: --allow-unsigned set; SHA256SUMS is NOT signed. Do not publish.');
  }
  return 0;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exit(1);
    }
  );
}
