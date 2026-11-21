// Minimal static file server for end-to-end tests against the production build.
// Unknown paths fall back to index.html, like the CloudFront SPA configuration will.
//
// Usage: node e2e/support/static-server.mjs <root-dir> <port>
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';

const [rootArg, portArg] = process.argv.slice(2);
const root = resolve(rootArg ?? 'dist/pracstack/browser');
const port = Number(portArg ?? 4300);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
};

createServer(async (req, res) => {
  const pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);
  const file = normalize(join(root, pathname));
  // Never serve files outside the root directory.
  if (file !== root && !file.startsWith(root + sep)) {
    res.writeHead(403).end();
    return;
  }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    const index = await readFile(join(root, 'index.html'));
    res.writeHead(200, { 'content-type': TYPES['.html'] });
    res.end(index);
  }
}).listen(port, () => console.log(`Serving ${root} on http://localhost:${port}`));
