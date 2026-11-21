/**
 * Local development server for the API.
 *
 *   npm run api                        # API on http://127.0.0.1:3100
 *   tsx services/api/src/local/server.ts --port 4317 --static dist/web/browser --data /tmp/x.json
 *
 * Binds to 127.0.0.1 only: the local developer user is unauthenticated, so
 * this server must never be reachable from other machines.
 */
import { randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { createApi } from '../app';
import { LocalDevAuthenticator } from '../auth';
import { loadContentSource } from '../content/content-source';
import { type ApiResponse, MAX_REQUEST_BODY_BYTES } from '../http';
import { SlidingWindowRateLimiter } from '../rate-limit';
import { FileProgressStore } from '../store/file-store';
import { ChildProcessSqlEngine, localOracle, OracleSqlEngine } from '@pracstack/sql-engine';
import { DockerCodeRunner } from '@pracstack/code-runner';
import { securityHeadersFor } from '@pracstack/web-security';

const MAX_BODY_BYTES = MAX_REQUEST_BODY_BYTES;
const HOST = '127.0.0.1';
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');

const { values: args } = parseArgs({
  options: {
    port: { type: 'string', default: process.env['PRACSTACK_API_PORT'] ?? '3100' },
    data: { type: 'string', default: join(repoRoot, '.local', 'progress.json') },
    content: { type: 'string', default: join(repoRoot, 'content', 'dist') },
    static: { type: 'string' },
    // Per-user rate limits (requests per minute). The defaults match production;
    // automated tests raise them because every test runs as the same local user.
    'requests-per-minute': { type: 'string', default: '120' },
    'sql-per-minute': { type: 'string', default: '30' },
    'code-per-minute': { type: 'string', default: '10' },
  },
});

// SQL runs in a separate process with time and memory limits (see docs/sql.md).
const sqlEngine = new ChildProcessSqlEngine();

// Oracle SQL runs on Oracle Database Free in Docker, if it was started (npm run oracle:start).
const oracle = await localOracle(join(repoRoot, '.local', 'oracle.json'), false).catch(
  () => undefined,
);
const oracleEngine = oracle ? new OracleSqlEngine({ connection: oracle }) : undefined;
if (!oracleEngine) {
  console.warn(
    'Oracle is not running: Oracle SQL questions that need a database are skipped. Start it with "npm run oracle:start".',
  );
}
const stop = () => {
  void sqlEngine.close().finally(() => process.exit(0));
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);

// Coding-challenge submissions run in throwaway Docker containers (see docs/runners.md).
const codeRunner = new DockerCodeRunner();
void codeRunner.check().then((status) => {
  if (!status.ok) {
    console.warn(
      `Code runner unavailable: ${status.message} Submissions will return 503 until it is fixed.`,
    );
  }
});

const api = createApi({
  sqlEngine,
  ...(oracleEngine ? { sqlEngines: { oracle: oracleEngine } } : {}),
  codeRunner,
  auth: new LocalDevAuthenticator(),
  allowLocalDevUser: true,
  content: loadContentSource(resolve(args.content)),
  store: new FileProgressStore(resolve(args.data)),
  rateLimiter: new SlidingWindowRateLimiter(Number(args['requests-per-minute']), 60_000),
  sqlRateLimiter: new SlidingWindowRateLimiter(Number(args['sql-per-minute']), 60_000),
  codeRateLimiter: new SlidingWindowRateLimiter(Number(args['code-per-minute']), 60_000),
  now: () => new Date(),
  random: Math.random,
  newId: randomUUID,
});

const staticRoot = args.static ? resolve(args.static) : undefined;

const server = createServer((req, res) => {
  void handle(req, res).catch((err: unknown) => {
    console.error(err);
    if (!res.headersSent)
      send(res, { status: 500, body: { error: { code: 'internal', message: 'Server error.' } } });
  });
});

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', `http://${HOST}`);
  if (url.pathname.startsWith('/api/')) {
    let body: unknown;
    try {
      body = await readJsonBody(req);
    } catch (err) {
      const tooLarge = err instanceof BodyTooLargeError;
      send(res, {
        status: tooLarge ? 413 : 400,
        body: { error: { code: 'bad-request', message: (err as Error).message } },
        ...(tooLarge ? { headers: { connection: 'close' } } : {}),
      });
      // Stop receiving the rest of an oversized upload once the reply is sent.
      if (tooLarge) res.on('finish', () => req.destroy());
      return;
    }
    const response = await api({
      method: req.method ?? 'GET',
      path: url.pathname,
      query: Object.fromEntries(url.searchParams),
      headers: req.headers as Record<string, string | undefined>,
      body,
    });
    send(res, response);
    return;
  }
  if (staticRoot) {
    await serveStatic(staticRoot, url.pathname, res);
    return;
  }
  send(res, { status: 404, body: { error: { code: 'not-found', message: 'Not found.' } } });
}

class BodyTooLargeError extends Error {}

function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolveBody, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let rejected = false;
    req.on('data', (chunk: Buffer) => {
      if (rejected) return;
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        rejected = true;
        chunks.length = 0;
        reject(new BodyTooLargeError(`Request body must be at most ${MAX_BODY_BYTES / 1024} KB.`));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (rejected) return;
      if (chunks.length === 0) return resolveBody(undefined);
      try {
        resolveBody(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new Error('Request body is not valid JSON.'));
      }
    });
    req.on('error', reject);
  });
}

function send(res: ServerResponse, response: ApiResponse): void {
  res.writeHead(response.status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    ...response.headers,
  });
  res.end(JSON.stringify(response.body));
}

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
};

/** Serves a built SPA: real files, otherwise index.html (client-side routes). */
async function serveStatic(root: string, pathname: string, res: ServerResponse): Promise<void> {
  const file = normalize(join(root, decodeURIComponent(pathname)));
  if (file !== root && !file.startsWith(root + sep)) {
    res.writeHead(403).end();
    return;
  }
  // The same security headers as production (CloudFront), so the e2e tests run under the real CSP.
  try {
    const body = await readFile(file);
    res.writeHead(200, {
      ...securityHeadersFor(pathname),
      'content-type': TYPES[extname(file)] ?? 'application/octet-stream',
    });
    res.end(body);
  } catch {
    res.writeHead(200, {
      ...securityHeadersFor('/'),
      'content-type': TYPES['.html'] ?? 'text/html',
    });
    res.end(await readFile(join(root, 'index.html')));
  }
}

server.listen(Number(args.port), HOST, () => {
  console.log(
    `PracStack API on http://${HOST}:${args.port} (local developer user; data: ${args.data})`,
  );
  if (staticRoot) console.log(`Serving ${staticRoot}`);
});
