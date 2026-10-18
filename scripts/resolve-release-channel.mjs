#!/usr/bin/env node
// Maps a release tag or package version to its update channel and feed file.
//
// The unsigned release pipeline (.github/workflows/release-pipeline.yml) uses
// this to pick the installers and electron-updater metadata for the Beta and
// Stable channels. It is intentionally dependency-free so it can run both in CI
// and in unit tests.
//
// Version scheme (see docs/release-pipeline.md):
//   Stable : 0.1.44            -> channel "stable", feed latest.yml
//   Beta   : 0.1.58-beta.1     -> channel "beta",   feed beta.yml
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const STABLE_CHANNEL = 'stable';
export const BETA_CHANNEL = 'beta';
export const STABLE_FEED = 'latest.yml';
export const BETA_FEED = 'beta.yml';

const VERSION_PATTERN = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/;
const BETA_PRERELEASE_PATTERN = /^beta\.(\d+)$/;

/**
 * Parses a release version and classifies its update channel.
 *
 * @param {unknown} raw version string, optionally prefixed with "v"
 * @returns {{ version: string, major: number, minor: number, patch: number,
 *   channel: string, prerelease: boolean, betaIndex: number | null }}
 */
export function parseReleaseVersion(raw) {
  if (typeof raw !== 'string') {
    throw new Error(`Release version must be a string, received ${typeof raw}.`);
  }
  const version = raw.trim().replace(/^v/, '');
  const match = VERSION_PATTERN.exec(version);
  if (!match) {
    throw new Error(`Unsupported release version "${raw}". Expected X.Y.Z or X.Y.Z-beta.N.`);
  }
  const [, major, minor, patch, prerelease] = match;
  if (prerelease === undefined) {
    return {
      version,
      major: Number(major),
      minor: Number(minor),
      patch: Number(patch),
      channel: STABLE_CHANNEL,
      prerelease: false,
      betaIndex: null
    };
  }
  const beta = BETA_PRERELEASE_PATTERN.exec(prerelease);
  if (!beta) {
    throw new Error(
      `Unsupported prerelease "${prerelease}" in "${raw}". Only beta.N prereleases are supported.`
    );
  }
  const betaIndex = Number(beta[1]);
  if (!Number.isInteger(betaIndex) || betaIndex < 1) {
    throw new Error(`Beta counter must be a positive integer in "${raw}".`);
  }
  return {
    version,
    major: Number(major),
    minor: Number(minor),
    patch: Number(patch),
    channel: BETA_CHANNEL,
    prerelease: true,
    betaIndex
  };
}

/**
 * Resolves the channel, feed file, and release type for a tag and/or version.
 *
 * @param {{ tag?: string, version?: string }} input
 * @returns {{ tag: string, version: string, channel: string, prerelease: boolean,
 *   feed: string, releaseType: 'prerelease' | 'release', betaIndex: number | null }}
 */
export function resolveReleaseChannel(input = {}) {
  const { tag, version } = input;
  if (version === undefined && tag === undefined) {
    throw new Error('resolveReleaseChannel requires a tag and/or a version.');
  }
  const parsed = parseReleaseVersion(version ?? tag);
  if (tag !== undefined) {
    const parsedTag = parseReleaseVersion(tag);
    if (parsedTag.version !== parsed.version) {
      throw new Error(`Tag "${tag}" does not match version "${parsed.version}".`);
    }
  }
  const isBeta = parsed.channel === BETA_CHANNEL;
  return {
    tag: `v${parsed.version}`,
    version: parsed.version,
    channel: parsed.channel,
    prerelease: isBeta,
    feed: isBeta ? BETA_FEED : STABLE_FEED,
    releaseType: isBeta ? 'prerelease' : 'release',
    betaIndex: parsed.betaIndex
  };
}

/**
 * Reads the version declared in a package.json file.
 *
 * @param {string} packageJsonPath path to package.json
 * @returns {string} the declared version
 */
export function readPackageVersion(packageJsonPath) {
  const manifest = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
  if (typeof manifest.version !== 'string' || manifest.version.length === 0) {
    throw new Error(`No version string in ${packageJsonPath}.`);
  }
  return manifest.version;
}

function main(argv) {
  const [reference, expectedVersion] = argv;
  if (!reference) {
    throw new Error('Usage: node scripts/resolve-release-channel.mjs <tag-or-version> [expected-version]');
  }
  const resolved = resolveReleaseChannel(
    reference.startsWith('v') && expectedVersion
      ? { tag: reference, version: expectedVersion }
      : { version: reference }
  );
  process.stdout.write(`${JSON.stringify(resolved)}\n`);
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
