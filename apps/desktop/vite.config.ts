import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { rendererBuildIdentity } from './scripts/renderer-build-identity.mjs';

const desktopDir = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const reactDir = path.dirname(require.resolve('react/package.json'));
const reactDomDir = path.dirname(require.resolve('react-dom/package.json'));

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
    dedupe: ['react', 'react-dom'],
    alias: {
      '@': path.resolve(desktopDir, 'src'),
      react: reactDir,
      'react-dom': reactDomDir
    }
  },
  server: {
    host: '127.0.0.1',
    port: 5173
  }
});
