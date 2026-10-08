import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

function rendererBuildIdentity(): string {
  const paths = execFileSync('git', ['ls-files', '-co', '--exclude-standard', 'apps/desktop/src', 'brand'], { encoding: 'utf8' })
    .split(/\r?\n/).filter(Boolean).sort();
  const hash = createHash('sha256');
  for (const file of [...paths, 'apps/desktop/package.json', 'apps/desktop/vite.config.ts']) {
    hash.update(file).update('\0').update(readFileSync(path.resolve(__dirname, '..', '..', file)));
  }
  return hash.digest('hex');
}

export default defineConfig({
  root: __dirname,
  base: './',
  publicDir: path.resolve(__dirname, '../../brand/assets'),
  plugins: [react()],
  define: { __LASTBROWSER_BUILD_ID__: JSON.stringify(rendererBuildIdentity()) },
  build: {
    outDir: 'dist/renderer',
    // Clear only dist/renderer. dist/main is a sibling and is preserved.
    // Keeping this false accumulated every historical hashed JS bundle and
    // ballooned the packaged renderer to hundreds of megabytes.
    emptyOutDir: true
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src')
    }
  },
  server: {
    host: '127.0.0.1',
    port: 5173
  }
});
