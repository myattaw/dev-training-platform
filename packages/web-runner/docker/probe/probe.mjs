// HTTP probe for web-challenge applications. TRUSTED image, but it runs next to
// untrusted code: it joins the application container's network namespace
// (`--network container:<app>`), which has only a loopback interface, so the
// only thing it can reach is the learner's application on 127.0.0.1.
//
// stdin:  ProbeInput JSON (requests only; never expected values)
// stdout: "\n<nonce><ProbeOutput JSON>\n"
//
// Every response is treated as untrusted data: sizes and times are bounded, and
// nothing in a response changes what the probe does next except the explicit
// `capture` instructions (values substituted into later requests).
import { request } from 'node:http';

const HOST = '127.0.0.1';
const MAX_BODY_BYTES = 64 * 1024;
const MAX_HEADER_COUNT = 50;
const PATH = /^\/[A-Za-z0-9\-._~!$&'()*+,;=:@%/?]*$/;
const METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']);
const HEADER_NAME = /^[A-Za-z0-9-]{1,64}$/;
const FORBIDDEN_HEADERS = new Set([
  'host',
  'content-length',
  'transfer-encoding',
  'connection',
  'upgrade',
  'proxy-authorization',
  'te',
  'trailer',
  'expect',
]);

const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
const { nonce, port, waitMs, requestTimeoutMs } = input;

function finish(output) {
  process.stdout.write(`\n${nonce}${JSON.stringify(output)}\n`);
  process.exit(0);
}

if (!Number.isInteger(port) || port < 1024 || port > 65535) {
  finish({ kind: 'error', message: 'invalid port' });
}

/** Sends one request; resolves with a bounded, untrusted response. */
function send(step) {
  return new Promise((resolve) => {
    const started = Date.now();
    const headers = { accept: 'application/json, text/plain, */*' };
    for (const [name, value] of Object.entries(step.headers ?? {})) {
      if (HEADER_NAME.test(name) && !FORBIDDEN_HEADERS.has(name.toLowerCase())) {
        headers[name.toLowerCase()] = String(value).slice(0, 1024);
      }
    }
    let body;
    if (step.body !== undefined && step.body !== null) {
      body = Buffer.from(String(step.body), 'utf8');
      headers['content-type'] ??= 'application/json';
      headers['content-length'] = String(body.length);
    }
    const req = request(
      { host: HOST, port, method: step.method, path: step.path, headers, timeout: requestTimeoutMs },
      (res) => {
        const parts = [];
        let size = 0;
        let truncated = false;
        res.on('data', (c) => {
          if (size >= MAX_BODY_BYTES) {
            truncated = true;
            res.destroy();
            return;
          }
          parts.push(c.subarray(0, MAX_BODY_BYTES - size));
          size += c.length;
        });
        const done = () => {
          const responseHeaders = {};
          for (const [name, value] of Object.entries(res.headers).slice(0, MAX_HEADER_COUNT)) {
            responseHeaders[name] = (Array.isArray(value) ? value.join(', ') : String(value)).slice(0, 1024);
          }
          resolve({
            status: res.statusCode ?? 0,
            headers: responseHeaders,
            body: Buffer.concat(parts).toString('utf8'),
            truncated,
            durationMs: Date.now() - started,
          });
        };
        res.on('end', done);
        res.on('close', done);
        res.on('error', () => done());
      },
    );
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', (err) =>
      resolve({
        error: err.message === 'timeout' ? 'The application did not respond in time.' : 'The application refused the connection or closed it.',
        durationMs: Date.now() - started,
      }),
    );
    if (body) req.write(body);
    req.end();
  });
}

/** Waits until something accepts HTTP requests on the port. */
async function waitForApp() {
  const deadline = Date.now() + waitMs;
  while (Date.now() < deadline) {
    const res = await send({ method: 'GET', path: '/' });
    if (res.status) return true;
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

/** Reads `a.b.0.c` from parsed JSON. */
function pick(value, path) {
  let current = value;
  for (const key of path.split('.')) {
    if (current === null || typeof current !== 'object') return undefined;
    current = current[key];
  }
  return current;
}

/** Replaces {{name}} with a captured value: URL-encoded in paths, JSON-escaped in bodies. */
function substitute(text, captures, encode) {
  return text.replace(/\{\{([a-zA-Z][a-zA-Z0-9_]{0,31})\}\}/g, (match, name) =>
    name in captures ? encode(String(captures[name])) : match,
  );
}
const inPath = (value) => encodeURIComponent(value);
const inJson = (value) => JSON.stringify(value).slice(1, -1);

if (waitMs > 0 && !(await waitForApp())) {
  finish({ kind: 'not-ready' });
}

const results = [];
for (const sequence of input.sequences ?? []) {
  const captures = {};
  const responses = [];
  for (const step of sequence) {
    const path = substitute(String(step.path), captures, inPath);
    const body = step.body === undefined || step.body === null ? step.body : substitute(String(step.body), captures, inJson);
    if (!METHODS.has(step.method) || !PATH.test(path) || path.startsWith('//') || path.length > 2048) {
      responses.push({ error: 'The request was refused: invalid method or path.' });
      continue;
    }
    const response = await send({ ...step, path, body });
    responses.push(response);
    if (step.capture && typeof response.body === 'string') {
      let parsed;
      try {
        parsed = JSON.parse(response.body);
      } catch {
        parsed = undefined;
      }
      for (const [name, jsonPath] of Object.entries(step.capture)) {
        const value = pick(parsed, String(jsonPath));
        if (typeof value === 'string' || typeof value === 'number') captures[name] = String(value).slice(0, 256);
      }
    }
  }
  results.push(responses);
}
finish({ kind: 'completed', results });
