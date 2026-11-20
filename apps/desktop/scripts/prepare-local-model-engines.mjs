// Offline packaging input only. Never downloads engines or copies model weights.
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { copyFile, lstat, mkdir, readFile, realpath, rename } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../..', import.meta.url));
const desktop = path.join(root, 'apps', 'desktop');
const args = process.argv.slice(2);
const verifyOnly = args.length === 2 && args[0] === '--verify';
const stage = (args.length === 2 || (args.length === 4 && args[2] === '--vc-runtime-source')) && args[0] === '--source';
if (!verifyOnly && !stage) throw new Error('Use --source <verified engine directory> [--vc-runtime-source <VC143.CRT directory>] or --verify <inventory root>');
const source = stage ? path.resolve(args[1]) : null;
const vcSource = stage && args.length === 4 ? path.resolve(args[3]) : null;
const inventoryRoot = verifyOnly ? path.resolve(args[1]) : root;
const registry = JSON.parse(await readFile(path.join(root, 'services/sidekick/runtime/local_ai/store-runtime-registry.json'), 'utf8'));
if (registry.schemaVersion !== 1 || !Array.isArray(registry.engines) || !registry.engines.length) throw new Error('No pinned engines');
// Microsoft.VC.14.44.17.14.CRT.Redist.X64.base 14.44.35211, VC143.CRT x64.
// Keep these package-local; a fresh Windows installation may lack vcruntime140_1.dll.
const vcFiles = [
  { relativePath: 'msvcp140.dll', bytes: 557728, sha256: '0f885b509a685d2bbfa652fed26b5fb31d88fbdab0a978c641d1c7b8aa460aa9' },
  { relativePath: 'vcruntime140.dll', bytes: 124544, sha256: 'd5e4d9a3e835fa679450145d6a7d94e36573a509317111904d9b3712c30d9066' },
  { relativePath: 'vcruntime140_1.dll', bytes: 49792, sha256: '1f2d41c4aa5db0bc33ebf7b66d72943a817d7ce6cbe880502a9403823633093f' },
  { relativePath: 'msvcp140_codecvt_ids.dll', bytes: 31872, sha256: 'f2069a52880ec885ee7f0511186100eb7fada0411a2b4948fafea7735b878a18' },
];
async function noLinks(value) {
  let current = path.resolve(value);
  for (;;) {
    const info = await lstat(current);
    if (info.isSymbolicLink()) throw new Error('Linked engine packaging inputs are forbidden');
    const parent = path.dirname(current); if (parent === current) break; current = parent;
  }
  if (path.resolve(value).toLowerCase() !== (await realpath(value)).toLowerCase()) throw new Error('Noncanonical packaging input');
}
async function verify(filename, fact) {
  await noLinks(filename);
  const info = await lstat(filename);
  if (!info.isFile() || info.nlink !== 1 || info.size !== fact.bytes) throw new Error(`Engine file identity mismatch: ${filename}`);
  const hash = createHash('sha256'); for await (const chunk of createReadStream(filename)) hash.update(chunk);
  if (hash.digest('hex') !== fact.sha256) throw new Error(`Engine file hash mismatch: ${filename}`);
}
if (source) await noLinks(source);
if (vcSource) await noLinks(vcSource);
const runtimeRoot = path.join(desktop, 'runtime', 'local-ai');
if (stage) {
  await mkdir(runtimeRoot, { recursive: true });
  await noLinks(runtimeRoot);
}
async function verifyVcFiles(directory, files, copyFrom) {
  for (const fact of files) {
    const destination = path.join(directory, fact.relativePath);
    if (copyFrom) {
      const source = path.join(copyFrom, fact.relativePath);
      await verify(source, fact);
      try { await copyFile(source, destination, 1); }
      catch (error) { if (error?.code !== 'EEXIST') throw error; }
    }
    await verify(destination, fact);
  }
}
for (const engine of registry.engines) {
  const manifest = engine.manifest;
  const relative = manifest.packageRelativeDir;
  if (typeof relative !== 'string' || !/^apps\/desktop\/runtime\/local-ai\/[a-zA-Z0-9._-]+$/.test(relative)) throw new Error('Invalid runtime package directory');
  const directoryName = path.posix.basename(relative);
  const destination = path.join(inventoryRoot, ...relative.split('/'));
  const engineSource = verifyOnly ? destination : path.join(source, directoryName);
  const crt = engine.engine === 'stable-diffusion.cpp' ? vcFiles : vcFiles.slice(0, 3);
  for (const fact of manifest.files) {
    if (typeof fact.relativePath !== 'string' || fact.relativePath.includes('\\') || fact.relativePath.includes(':')
      || fact.relativePath.split('/').some(part => !part || part === '.' || part === '..')) throw new Error('Invalid pinned file path');
    await verify(path.join(engineSource, ...fact.relativePath.split('/')), fact);
  }
  if (verifyOnly) {
    await verifyVcFiles(destination, crt);
    console.log(`Verified ${engine.id} and app-local VC++ runtime`);
    continue;
  }
  if (!destination.startsWith(runtimeRoot + path.sep)) throw new Error('Engine target escaped workspace');
  let exists = false;
  try { await lstat(destination); exists = true; }
  catch (error) { if (error?.code !== 'ENOENT') throw error; }
  if (exists) {
    for (const fact of manifest.files) await verify(path.join(destination, ...fact.relativePath.split('/')), fact);
    if (vcSource) await verifyVcFiles(destination, crt, vcSource);
    console.log(`Verified existing ${engine.id}`); continue;
  }
  const stage = path.join(root, 'output', 'local-store-runtime-20261014', 'package-staging', randomUUID());
  if (!stage.startsWith(path.join(root, 'output') + path.sep)) throw new Error('Engine stage escaped workspace');
  await mkdir(stage, { recursive: true }); await noLinks(stage);
  for (const fact of manifest.files) {
    const target = path.join(stage, ...fact.relativePath.split('/'));
    await mkdir(path.dirname(target), { recursive: true });
    await copyFile(path.join(engineSource, ...fact.relativePath.split('/')), target, 1);
    await verify(target, fact);
  }
  if (vcSource) await verifyVcFiles(stage, crt, vcSource);
  // Both absolute paths were checked above; no recursive move or deletion.
  for (let attempt = 0;; attempt++) {
    try { await rename(stage, destination); break; }
    catch (error) {
      if (!['EPERM','EACCES','EBUSY'].includes(error?.code) || attempt >= 4) throw error;
      await new Promise(resolve => setTimeout(resolve, 200 * (attempt + 1)));
    }
  }
  console.log(`Staged verified ${engine.id} (${manifest.files.length} pinned files)`);
}
if (stage) console.log('Engine inventory staged. Clean-machine dependency/runtime and signed-package qualification remain separate.');
