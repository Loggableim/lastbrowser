/**
 * electron-builder's AppImage stage writes AppRun after afterPack. The older
 * template searches for "$1", so `./AppRun --no-sandbox` after
 * --appimage-extract execs /Lastbrowser. Rewrite that script and repack the
 * squashfs behind the existing runtime header. No release and no signing.
 */
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const { patchAppRunText } = createRequire(import.meta.url)('./patch-linux-apprun.cjs');

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: 'inherit', ...options });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed with ${result.status}`);
  }
}

export function repackAppImage(appImage) {
  const directory = mkdtempSync(path.join(tmpdir(), 'lb-apprun-'));
  const root = path.join(directory, 'squashfs-root');
  const runtime = path.join(directory, 'runtime');
  const squash = path.join(directory, 'image.squashfs');
  const packed = `${appImage}.repacked`;
  try {
    run(appImage, ['--appimage-extract'], { cwd: directory, stdio: 'pipe' });
    const appRun = path.join(root, 'AppRun');
    writeFileSync(appRun, patchAppRunText(readFileSync(appRun, 'utf8')));
    chmodSync(appRun, 0o755);
    const offset = spawnSync(appImage, ['--appimage-offset'], { encoding: 'utf8' });
    const bytes = Number(offset.stdout?.trim());
    if (offset.status !== 0 || !Number.isInteger(bytes) || bytes < 1024) {
      throw new Error(`Could not read the AppImage runtime offset from ${appImage}`);
    }
    run('dd', [`if=${appImage}`, `of=${runtime}`, 'bs=1', `count=${bytes}`]);
    run('mksquashfs', [
      root, squash, '-comp', 'gzip', '-b', '131072', '-no-fragments', '-no-xattrs', '-noappend', '-all-root'
    ]);
    run('sh', ['-c', 'cat "$1" "$2" > "$3"', 'sh', runtime, squash, packed]);
    chmodSync(packed, 0o755);
    run('mv', ['-f', packed, appImage]);
    console.log(`[appimage] Patched AppRun in ${appImage}`);
  } finally {
    rmSync(directory, { recursive: true, force: true });
    rmSync(packed, { force: true });
  }
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (isDirectRun) {
  const appImage = path.resolve(process.argv[2] || 'release/Lastbrowser-0.1.57-demo.4-x86_64.AppImage');
  repackAppImage(appImage);
}
