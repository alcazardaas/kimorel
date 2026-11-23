import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { readFile, lstat } from 'node:fs/promises';
import { resolve, sep } from 'node:path';

const repo = fileURLToPath(new URL('./', import.meta.url));
const files: Record<string, string> = {
  'catalog.json': 'pipeline/character-v2/muscles-upper-arm-draft/catalog.json',
  'character.glb':
    'pipeline/character-v2/correctives/character-v2-correctives.glb',
  ...Object.fromEntries(
    [
      'left-deltoid',
      'right-deltoid',
      'left-biceps-brachii',
      'right-biceps-brachii',
    ].map((id) => [
      `${id}.json`,
      `pipeline/character-v2/masks/upper-arm-draft/${id}.json`,
    ]),
  ),
};
export default defineConfig({
  root: fileURLToPath(new URL('./apps/mask-preview', import.meta.url)),
  server: {
    host: '127.0.0.1',
    port: 4177,
    strictPort: true,
    fs: {
      strict: true,
      allow: [repo],
      deny: [
        '**/.env',
        '**/.env.*',
        '**/*.{crt,pem}',
        '**/.git/**',
        '**/odd/**',
        '**/pipeline/**',
        '**/assets/**',
      ],
    },
  },
  plugins: [
    {
      name: 'isolated-draft-mask-files',
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          if (!req.url?.startsWith('/__draft')) return next();
          const url = req.url;
          if (
            !['GET', 'HEAD'].includes(req.method ?? '') ||
            url.includes('?') ||
            url.includes('%') ||
            url.includes('..') ||
            url.includes('\\')
          ) {
            res.writeHead(400).end('Invalid draft request');
            return;
          }
          const file = files[url.slice('/__draft/'.length)];
          if (!url.startsWith('/__draft/') || !file) {
            res.writeHead(404).end('Unknown draft file');
            return;
          }
          try {
            const parts = file.split('/');
            let path = resolve(repo);
            for (const part of parts) {
              path += sep + part;
              const info = await lstat(path);
              if (info.isSymbolicLink()) throw new Error('Symlink draft path');
            }
            if (!(await lstat(path)).isFile())
              throw new Error('Not a draft file');
            const data = await readFile(path);
            res.setHeader('Cache-Control', 'no-store');
            res.setHeader('X-Content-Type-Options', 'nosniff');
            res.setHeader(
              'Content-Type',
              file.endsWith('.glb') ? 'model/gltf-binary' : 'application/json',
            );
            res.writeHead(200);
            res.end(req.method === 'HEAD' ? undefined : data);
          } catch {
            res.writeHead(500).end('Draft file unavailable');
          }
        });
      },
    },
  ],
});
