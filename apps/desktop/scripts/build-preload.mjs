import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const desktopDir = path.resolve(scriptDir, '..');

await build({
  entryPoints: ['preload.ts', 'protected-space-unlock-preload.ts']
    .map(file => path.join(desktopDir, 'src', 'main', file)),
  outdir: path.join(desktopDir, 'dist', 'main'),
  outExtension: { '.js': '.cjs' },
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  external: ['electron'],
  sourcemap: false
});
