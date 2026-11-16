import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

// A host-owned consumer fixture, built separately from the production demo.
export default defineConfig({
  root: fileURLToPath(new URL('./tests/browser/host', import.meta.url)),
  base: './',
  build: {
    outDir: fileURLToPath(new URL('./.cache/browser-host', import.meta.url)),
    emptyOutDir: true,
  },
});
