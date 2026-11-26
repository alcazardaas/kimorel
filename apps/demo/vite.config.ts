import { defineConfig } from 'vite';
import { createReadStream } from 'node:fs';
import { readFile, mkdir, writeFile, cp } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pilotAssets } from './src/pilot';

async function pilotBytes(id: string) {
  const expected = Object.hasOwn(pilotAssets, id) ? pilotAssets[id] : undefined;
  if (!expected) throw new Error('Unknown pilot asset');
  const data = await readFile(
    new URL(
      `../../pipeline/character-v2/exercise-pilot/${id}.glb`,
      import.meta.url,
    ),
  );
  if (createHash('sha256').update(data).digest('hex') !== expected.sha256)
    throw new Error('Pilot asset hash mismatch');
  return data;
}
// One editable documentation source, copied into the static site at build time.
export default defineConfig({
  base: './',
  plugins: [
    {
      name: 'kimorel-docs',
      configureServer(server) {
        server.middlewares.use('/assets/character-v2', async (req, res) => {
          const match = /^\/([a-z0-9-]+)\.glb$/.exec(req.url ?? '');
          if (
            !match ||
            !['GET', 'HEAD'].includes(req.method ?? '') ||
            !Object.hasOwn(pilotAssets, match[1]!)
          ) {
            res.writeHead(404).end('Unknown pilot asset');
            return;
          }
          try {
            const data = await pilotBytes(match[1]!);
            res.setHeader('Content-Type', 'model/gltf-binary');
            res.setHeader('Cache-Control', 'no-store');
            res.setHeader('X-Content-Type-Options', 'nosniff');
            res.writeHead(200).end(req.method === 'HEAD' ? undefined : data);
          } catch {
            res.writeHead(503).end('Experimental pilot unavailable');
          }
        });
        server.middlewares.use('/assets', (req, res, next) => {
          const file = req.url?.split('?')[0];
          if (!file || !/^\/exercises\/[a-z0-9-]+\.glb$/.test(file))
            return next();
          res.setHeader('Content-Type', 'model/gltf-binary');
          createReadStream(new URL(`../../assets${file}`, import.meta.url))
            .on('error', next)
            .pipe(res);
        });
        server.middlewares.use('/docs', async (_req, res, next) => {
          try {
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.end(
              await readFile(
                new URL('../../docs/index.html', import.meta.url),
                'utf8',
              ),
            );
          } catch (error) {
            next(error);
          }
        });
      },
      async closeBundle() {
        await mkdir(new URL('./dist/assets/character-v2', import.meta.url), {
          recursive: true,
        });
        for (const id of Object.keys(pilotAssets)) {
          await writeFile(
            new URL(`./dist/assets/character-v2/${id}.glb`, import.meta.url),
            await pilotBytes(id),
          );
        }
        await mkdir(new URL('./dist/assets/exercises', import.meta.url), {
          recursive: true,
        });
        await cp(
          new URL('../../assets/exercises', import.meta.url),
          new URL('./dist/assets/exercises', import.meta.url),
          { recursive: true },
        );
        await mkdir(new URL('./dist/docs', import.meta.url), {
          recursive: true,
        });
        await writeFile(
          new URL('./dist/docs/index.html', import.meta.url),
          await readFile(new URL('../../docs/index.html', import.meta.url)),
        );
      },
    },
  ],
});
