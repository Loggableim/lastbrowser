import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../vendor/local-ai/', import.meta.url));
const lock = JSON.parse(readFileSync(path.join(root, 'runtime-lock.json'), 'utf8'));
const hash = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');
// Prototype: the installer ships only the pinned catalog. Engines are fetched
// on demand by the application. Set the flag to bundle engines again.
const bundleRuntime = process.env.LASTBROWSER_BUNDLE_LOCAL_AI_RUNTIME === '1';
for (const asset of lock.assets) {
  const archive = path.join(root, asset.archive);
  if (hash(archive) !== asset.sha256) throw new Error(`Runtime archive checksum mismatch: ${asset.archive}`);
  if (!Number.isSafeInteger(asset.bytes) || readFileSync(archive).length !== asset.bytes) throw new Error(`Runtime archive size mismatch: ${asset.archive}`);
  const destination = path.join(root, asset.backend);
  if (!existsSync(destination) && bundleRuntime) {
    if (process.platform !== 'win32') throw new Error('Prepare the Windows runtime on Windows. No network downloads are performed.');
    const quote = (value) => "'" + value.replaceAll("'", "''") + "'";
    execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `Expand-Archive -LiteralPath ${quote(archive)} -DestinationPath ${quote(destination)}`], { windowsHide: true });
  }
  if (!existsSync(destination)) continue;
  for (const file of asset.files) {
    const target = path.resolve(destination, file.path);
    if (!target.startsWith(destination + path.sep) || hash(target) !== file.sha256) throw new Error(`Runtime file checksum mismatch: ${file.path}`);
  }
}
console.log(bundleRuntime
  ? `[local-ai] Verified bundled offline runtime ${lock.version}: CPU and Vulkan.`
  : `[local-ai] Verified on-demand runtime catalog ${lock.version}; engines are downloaded by the app.`);
