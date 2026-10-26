import { defineConfig } from 'vite';
import { resolve } from 'path';
import { precacheServiceWorker } from './build/precacheServiceWorker';

export default defineConfig({
  root: '.',
  // Relative base so the app works from any sub-path (e.g. GitHub Pages project pages)
  base: './',
  resolve: {
    alias: {
      '@cvd-tools/color-core': resolve(__dirname, '../../packages/color-core/src'),
    },
  },
  server: {
    port: 5199,
    host: true,
  },
  worker: {
    format: 'es',
  },
  plugins: [
    precacheServiceWorker({
      template: resolve(__dirname, 'sw-template.js'),
      publicDir: resolve(__dirname, 'public'),
    }),
  ],
  build: {
    outDir: 'dist',
    target: 'es2022',
  },
});
