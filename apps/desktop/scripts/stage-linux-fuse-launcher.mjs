/**
 * Copy the fuse-independent Linux launcher next to the AppImage.
 * Bundle host libfuse.so.2 when the build machine has it. The .so stays in
 * the release directory and is not committed.
 */
import { chmodSync, copyFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const releaseDir = path.resolve(process.argv[2] || path.join(here, '..', 'release'));
const launcher = path.join(here, 'run-linux-preview.sh');
const target = path.join(releaseDir, 'run-linux-preview.sh');

mkdirSync(releaseDir, { recursive: true });
copyFileSync(launcher, target);
chmodSync(target, 0o755);

const candidates = [
  '/lib/x86_64-linux-gnu/libfuse.so.2',
  '/usr/lib/x86_64-linux-gnu/libfuse.so.2',
  '/lib64/libfuse.so.2',
  '/usr/lib64/libfuse.so.2',
];
const source = candidates.find((item) => existsSync(item));
if (source) {
  const libDir = path.join(releaseDir, 'lib');
  mkdirSync(libDir, { recursive: true });
  copyFileSync(source, path.join(libDir, 'libfuse.so.2'));
  console.log(`[linux] bundled ${source} beside the preview launcher`);
} else {
  console.log('[linux] libfuse.so.2 was not on the build host; the default launcher still extracts and runs');
}
console.log(`[linux] default start: ${target}`);
