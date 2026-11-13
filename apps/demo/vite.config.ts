import { defineConfig } from 'vite';
import { createReadStream } from 'node:fs';
import { readFile, mkdir, writeFile, cp } from 'node:fs/promises';
// One editable documentation source, copied into the static site at build time.
export default defineConfig({
  base: './',
  plugins: [
    {
      name: 'kimorel-docs',
      configureServer(server) {
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
