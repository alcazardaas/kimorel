import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, sep, extname } from 'node:path';

const demo = fileURLToPath(new URL('../../apps/demo/dist/', import.meta.url));
const host = fileURLToPath(
  new URL('../../.cache/browser-host/', import.meta.url),
);
const assets = fileURLToPath(new URL('../../assets/', import.meta.url));
const types = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.glb': 'model/gltf-binary',
};

async function serve(req, res, roots) {
  res.setHeader('Cache-Control', 'no-store');
  const pathname = new URL(req.url ?? '/', 'http://127.0.0.1').pathname;
  if (pathname === '/favicon.ico') {
    res.writeHead(204).end();
    return;
  }
  const match = roots.find(([prefix]) => pathname.startsWith(prefix));
  if (!match) {
    res.writeHead(404).end('Not found');
    return;
  }
  const [prefix, root] = match;
  try {
    const suffix = decodeURIComponent(pathname.slice(prefix.length));
    const path = resolve(root, suffix || 'index.html');
    if (!path.startsWith(resolve(root) + sep)) {
      res.writeHead(403).end();
      return;
    }
    const file = (await stat(path)).isDirectory()
      ? resolve(path, 'index.html')
      : path;
    const bytes = await readFile(file);
    res.setHeader(
      'Content-Type',
      types[extname(file)] ?? 'application/octet-stream',
    );
    res.writeHead(200).end(bytes);
  } catch {
    res.writeHead(404).end('Not found');
  }
}

const servers = [
  createServer((req, res) => {
    void serve(req, res, [
      ['/kimorel/', demo],
      ['/host/', host],
    ]);
  }),
  createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', 'http://127.0.0.1:4175');
    void serve(req, res, [['/library/', assets]]);
  }),
];

function shutdown() {
  for (const server of servers) {
    server.close();
    server.closeAllConnections();
  }
}
process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);
servers.forEach((server, index) => {
  server.on('error', (error) => {
    console.error(error);
    shutdown();
    process.exitCode = 1;
  });
  server.listen(4175 + index, '127.0.0.1');
});
