import { pathToFileURL } from 'node:url';

const TAG_PATTERN = /^v(\d+\.\d+\.\d+)(?:-beta\.(\d+))?$/;

export function resolveReleaseChannel(tag, packageVersion) {
  const match = TAG_PATTERN.exec(tag);
  if (!match) throw new Error(`Unsupported release tag: ${tag}`);

  const [, version, betaSequence] = match;
  const channel = betaSequence ? 'beta' : 'latest';
  const expectedVersion = betaSequence ? `${version}-beta.${betaSequence}` : version;
  if (packageVersion !== expectedVersion) {
    throw new Error(`Tag ${tag} does not match desktop package version ${packageVersion}`);
  }
  const [major, minor, patch] = version.split('.').map(Number);
  if (channel === 'beta' && major === 0 && minor <= 1 && (minor < 1 || patch < 57)) {
    throw new Error(`Beta releases start at the 0.1.57 line; got ${tag}`);
  }

  return { channel, prerelease: channel === 'beta', version: expectedVersion };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = resolveReleaseChannel(process.argv[2], process.argv[3]);
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
