import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import yaml from 'js-yaml';

const releaseDir = path.resolve(process.argv[2] || 'apps/desktop/release');
const appBuilder = path.resolve(process.argv[3] || 'node_modules/app-builder-bin/win/x64/app-builder.exe');
const metadataPath = path.join(releaseDir, 'latest.yml');
const metadata = yaml.load(await readFile(metadataPath, 'utf8'));
if (!metadata || typeof metadata !== 'object' || !Array.isArray(metadata.files)
  || typeof metadata.version !== 'string' || !/^\d+\.\d+\.\d+$/.test(metadata.version)) {
  throw new Error(`Invalid electron-updater metadata: ${metadataPath}`);
}

const setupName = `Lastbrowser-${metadata.version}-x64-setup.exe`;
const portableName = `Lastbrowser-${metadata.version}-x64-portable.exe`;
const expectedNames = [setupName, portableName];
const executables = (await readdir(releaseDir)).filter((name) => /\.exe$/i.test(name)).sort();
if (executables.length !== expectedNames.length || expectedNames.some((name) => !executables.includes(name))) {
  throw new Error(`Expected exactly ${expectedNames.join(' and ')} in ${releaseDir}; found ${executables.join(', ') || 'no executables'}`);
}

const initialUrls = metadata.files.map((file) => file?.url);
if (initialUrls.some((url) => url !== setupName && url !== portableName)
  || initialUrls.filter((url) => url === setupName).length !== 1
  || initialUrls.filter((url) => url === portableName).length > 1
  || (metadata.path != null && metadata.path !== setupName)) {
  throw new Error(`latest.yml must reference ${setupName} as its update path and contain no unexpected executable entries`);
}

const setupPath = path.join(releaseDir, setupName);
const portablePath = path.join(releaseDir, portableName);
const blockmapPath = `${setupPath}.blockmap`;
const setupEntry = metadata.files.find((file) => file.url === setupName);
const portableEntry = metadata.files.find((file) => file.url === portableName) || { url: portableName };

const blockmapResult = spawnSync(appBuilder, ['blockmap', '--input', setupPath, '--output', blockmapPath], {
  stdio: 'inherit',
  windowsHide: true
});
if (blockmapResult.error) throw blockmapResult.error;
if (blockmapResult.status !== 0) throw new Error(`app-builder blockmap failed with exit code ${blockmapResult.status}`);

async function getArtifactMetadata(filePath) {
  const hash = createHash('sha512');
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return { sha512: hash.digest('base64'), size: (await stat(filePath)).size };
}

const setupInfo = await getArtifactMetadata(setupPath);
const portableInfo = await getArtifactMetadata(portablePath);
Object.assign(setupEntry, setupInfo);
Object.assign(portableEntry, portableInfo);
// Keep the installer first: electron-updater selects the first architecture-matched EXE.
metadata.files = [setupEntry, portableEntry];
metadata.path = setupName;
metadata.sha512 = setupInfo.sha512;
await writeFile(metadataPath, yaml.dump(metadata, { lineWidth: -1, noRefs: true }), 'utf8');

const verifiedMetadata = yaml.load(await readFile(metadataPath, 'utf8'));
const expectedFiles = [
  { name: setupName, ...setupInfo },
  { name: portableName, ...portableInfo }
];
const verifiedUrls = verifiedMetadata.files.map((file) => file.url);
if (verifiedUrls.length !== expectedFiles.length || expectedFiles.some((expected, index) => {
  const actual = verifiedMetadata.files[index];
  return actual?.url !== expected.name || actual?.sha512 !== expected.sha512 || actual?.size !== expected.size;
}) || verifiedMetadata.path !== setupName || verifiedMetadata.sha512 !== setupInfo.sha512) {
  throw new Error('Signed setup/portable checksum, size, and update-path metadata verification failed');
}
if ((await stat(blockmapPath)).size === 0) throw new Error('Generated differential blockmap is empty');
console.log(`Refreshed signed-release metadata for ${setupName} and ${portableName}`);
