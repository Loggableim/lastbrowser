#!/usr/bin/env node
/**
 * Single checksum + signing step for Linux release artifacts (AppImage + tar.gz).
 * Writes SHA256SUMS and a detached, armored GPG signature SHA256SUMS.asc, then
 * verifies that the signature was made by the configured LastBrowser key.
 *
 * Usage:
 *   node scripts/linux-release-checksums.mjs [releaseDir] [--allow-unsigned]
 *   node scripts/linux-release-checksums.mjs --check-key [--allow-unsigned]
 *     (preflight only: fails fast before electron-builder if no key is configured)
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
import { readdir, rm, writeFile } from 'node:fs/promises';
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

const normalizeFpr = (value) => value.replace(/\s+/g, '').replace(/^0x/i, '').toUpperCase();

/** Resolves the configured key (id, email or fingerprint) to its primary + subkey fingerprints. */
export function resolveKeyFingerprints(keyId, { run = spawnSync } = {}) {
  const res = run('gpg', ['--batch', '--with-colons', '--fingerprint', '--fingerprint', keyId], {
    encoding: 'utf8'
  });
  if (res.error || res.status !== 0) {
    throw new Error(`[linux-release] configured key ${keyId} not found in gpg keyring`);
  }
  const lines = String(res.stdout ?? '').split(/\r?\n/);
  const pubCount = lines.filter((l) => l.startsWith('pub:')).length;
  if (pubCount !== 1) {
    throw new Error(`[linux-release] LASTBROWSER_GPG_KEY_ID must match exactly one key (matched ${pubCount})`);
  }
  const fprs = lines.filter((l) => l.startsWith('fpr:')).map((l) => normalizeFpr(l.split(':')[9] ?? ''));
  if (fprs.length === 0) throw new Error(`[linux-release] no fingerprint found for key ${keyId}`);
  return { primary: fprs[0], all: fprs };
}

/** Parses `gpg --status-fd` output; returns {signer, primary} fingerprints of a GOODSIG/VALIDSIG. */
export function parseValidSig(statusOutput) {
  const lines = String(statusOutput ?? '').split(/\r?\n/);
  if (!lines.some((l) => l.includes('[GNUPG:] GOODSIG '))) return null;
  const valid = lines.find((l) => l.includes('[GNUPG:] VALIDSIG '));
  if (!valid) return null;
  const parts = valid.trim().split(/\s+/);
  const idx = parts.indexOf('VALIDSIG');
  const signer = normalizeFpr(parts[idx + 1] ?? '');
  const primary = normalizeFpr(parts[idx + 10] ?? parts[idx + 1] ?? '');
  return { signer, primary };
}

export async function signChecksums(releaseDir, keyId, { run = spawnSync, remove = rm } = {}) {
  const sumsPath = path.join(releaseDir, SUMS_FILE);
  const sigPath = path.join(releaseDir, SIG_FILE);
  const expected = resolveKeyFingerprints(keyId, { run });

  // Never let a stale signature survive a failed re-sign.
  await remove(sigPath, { force: true });

  const sign = run(
    'gpg',
    ['--batch', '--yes', '--armor', '--detach-sign', '--local-user', keyId, '--output', sigPath, sumsPath],
    { stdio: 'inherit' }
  );
  if (sign.error || sign.status !== 0) {
    throw new Error(`[linux-release] gpg signing failed (exit ${sign.status ?? 'n/a'})`);
  }
  const verify = run('gpg', ['--batch', '--status-fd', '1', '--verify', sigPath, sumsPath], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit']
  });
  if (verify.error || verify.status !== 0) {
    throw new Error('[linux-release] gpg verification of SHA256SUMS.asc failed');
  }
  const sig = parseValidSig(verify.stdout);
  if (!sig) throw new Error('[linux-release] gpg verify produced no GOODSIG/VALIDSIG status');
  if (sig.primary !== expected.primary || !expected.all.includes(sig.signer)) {
    throw new Error(
      `[linux-release] SHA256SUMS.asc signed by ${sig.signer} (primary ${sig.primary}), ` +
        `expected LastBrowser key ${expected.primary}`
    );
  }
  return sigPath;
}

export async function main(argv, env = process.env, { log = console.log, deps = {} } = {}) {
  const allowUnsigned = argv.includes('--allow-unsigned');
  const checkKeyOnly = argv.includes('--check-key');
  // Fail before hashing (or building) anything if no signing key is configured.
  const keyId = resolveSigningKey(env, { allowUnsigned });
  if (checkKeyOnly) {
    if (keyId) resolveKeyFingerprints(keyId, { run: deps.run ?? spawnSync });
    log(keyId ? `[linux-release] signing key ${keyId} OK` : '[linux-release] WARNING: unsigned build');
    return 0;
  }
  const positional = argv.filter((arg) => !arg.startsWith('--'));
  const releaseDir = path.resolve(positional[0] ?? 'release');

  const { sumsPath, entries } = await (deps.writeChecksums ?? writeChecksums)(releaseDir);
  for (const entry of entries) log(`[linux-release] ${entry.sha256}  ${entry.name}`);
  log(`[linux-release] wrote ${sumsPath}`);

  if (keyId) {
    const sigPath = await (deps.signChecksums ?? signChecksums)(releaseDir, keyId);
    log(`[linux-release] signed ${sumsPath} -> ${sigPath} (key ${keyId})`);
  } else {
    await (deps.remove ?? rm)(path.join(releaseDir, SIG_FILE), { force: true });
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
