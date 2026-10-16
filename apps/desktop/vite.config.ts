import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { rendererBuildIdentity } from './scripts/renderer-build-identity.mjs';

const desktopDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: desktopDir,
  base: './',
  publicDir: path.resolve(desktopDir, '../../brand/assets'),
  plugins: [react()],
  define: { __LASTBROWSER_BUILD_ID__: JSON.stringify(rendererBuildIdentity(path.resolve(desktopDir, '../..'))) },
  build: {
    outDir: 'dist/renderer',
    // Clear only dist/renderer. dist/main is a sibling and is preserved.
    // Keeping this false accumulated every historical hashed JS bundle and
    // ballooned the packaged renderer to hundreds of megabytes.
    emptyOutDir: true
  },
  resolve: {
    alias: {
      '@': path.resolve(desktopDir, 'src')
    },
    // React 19's dual CJS/ESM entry was landing in the bundle twice, so the
    // renderer set one copy's dispatcher and components called hooks on the other.
    dedupe: ['react', 'react-dom']
  },
  server: {
    host: '127.0.0.1',
    port: 5173
  }
});
