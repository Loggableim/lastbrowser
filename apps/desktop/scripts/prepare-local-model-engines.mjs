// Offline packaging input only. Never downloads engines or copies model weights.
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { copyFile, lstat, mkdir, readFile, realpath, rename } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../..', import.meta.url));
const desktop = path.join(root, 'apps', 'desktop');
const args = process.argv.slice(2);
if (args.length !== 2 || args[0] !== '--source') throw new Error('Use --source <verified engine acquisition directory>');
const source = path.resolve(args[1]);
const registry = JSON.parse(await readFile(path.join(root, 'services/sidekick/runtime/local_ai/store-runtime-registry.json'), 'utf8'));
if (registry.schemaVersion !== 1 || !Array.isArray(registry.engines) || !registry.engines.length) throw new Error('No pinned engines');
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
  if (!info.isFile() || info.nlink !== 1 || info.size !== fact.bytes) throw new Error('Engine file identity mismatch');
  const hash = createHash('sha256'); for await (const chunk of createReadStream(filename)) hash.update(chunk);
  if (hash.digest('hex') !== fact.sha256) throw new Error('Engine file hash mismatch');
}
await noLinks(source);
const runtimeRoot = path.join(desktop, 'runtime', 'local-ai');
await mkdir(runtimeRoot, { recursive: true }); await noLinks(runtimeRoot);
for (const engine of registry.engines) {
  const manifest = engine.manifest;
  const relative = manifest.packageRelativeDir;
  if (typeof relative !== 'string' || !/^apps\/desktop\/runtime\/local-ai\/[a-zA-Z0-9._-]+$/.test(relative)) throw new Error('Invalid runtime package directory');
  const directoryName = path.posix.basename(relative);
  const engineSource = path.join(source, directoryName);
  const destination = path.join(root, ...relative.split('/'));
  if (!destination.startsWith(runtimeRoot + path.sep)) throw new Error('Engine target escaped workspace');
  for (const fact of manifest.files) {
    if (typeof fact.relativePath !== 'string' || fact.relativePath.includes('\\') || fact.relativePath.includes(':')
      || fact.relativePath.split('/').some(part => !part || part === '.' || part === '..')) throw new Error('Invalid pinned file path');
    await verify(path.join(engineSource, ...fact.relativePath.split('/')), fact);
  }
  let exists = false;
  try { await lstat(destination); exists = true; }
  catch (error) { if (error?.code !== 'ENOENT') throw error; }
  if (exists) {
    for (const fact of manifest.files) await verify(path.join(destination, ...fact.relativePath.split('/')), fact);
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
console.log('Engine inventory staged. Clean-machine dependency/runtime and signed-package qualification remain separate.');
