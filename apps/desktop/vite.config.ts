import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  root: __dirname,
  base: './',
  publicDir: path.resolve(__dirname, '../../brand/assets'),
  plugins: [react()],
  build: {
    outDir: 'dist/renderer',
    emptyOutDir: false
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
