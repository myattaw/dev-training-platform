import { spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WEB_RUNNER_IMAGES } from './protocol';

/*
 * The HTTP probe against a tiny application container (Node, no network),
 * through the real images. Needs Docker; PRACSTACK_SKIP_DOCKER_TESTS=1 skips.
 */
const skip = process.env['PRACSTACK_SKIP_DOCKER_TESTS'] === '1';
const app = `pracstack-probe-test-${randomUUID()}`;
// Every response is ~3 KB of JSON; the paths echo back so order can be checked.
const SERVER = `require('http').createServer((q, s) => {
  s.setHeader('content-type', 'application/json');
  s.end(JSON.stringify({ path: q.url, filler: 'x'.repeat(3000) }));
}).listen(8080, '127.0.0.1');`;

function probe(input: unknown): Promise<string> {
  return new Promise((resolve) => {
    const child = spawn('docker', [
      'run',
      '--rm',
      '-i',
      '--pull',
      'never',
      '--network',
      `container:${app}`,
      '--read-only',
      '--cap-drop',
      'ALL',
      '--security-opt',
      'no-new-privileges',
      '--user',
      '10001:10001',
      '--memory',
      '128m',
      WEB_RUNNER_IMAGES.probe,
    ]);
    let out = '';
    child.stdout.on('data', (c: Buffer) => (out += c.toString('utf8')));
    child.on('close', () => resolve(out));
    child.stdin.end(JSON.stringify(input));
  });
}

describe.skipIf(skip)('HTTP probe (real images)', { timeout: 120_000 }, () => {
  beforeAll(() => {
    spawnSync('docker', [
      'run',
      '-d',
      '--rm',
      '--name',
      app,
      '--network',
      'none',
      '--read-only',
      '--cap-drop',
      'ALL',
      '--user',
      '10001:10001',
      'node:22.17-alpine3.22',
      'node',
      '-e',
      SERVER,
    ]);
  });
  afterAll(() => {
    spawnSync('docker', ['rm', '-f', app]);
  });

  it('returns every response intact, even when the result is far larger than a pipe buffer', async () => {
    const nonce = '@@TEST@@';
    const steps = Array.from({ length: 60 }, (_, i) => ({ method: 'GET', path: `/item/${i}` }));
    const out = await probe({
      nonce,
      port: 8080,
      waitMs: 20_000,
      requestTimeoutMs: 5000,
      sequences: [steps],
    });
    const line = out.split('\n').find((l) => l.startsWith(nonce)) ?? '';
    expect(line.length).toBeGreaterThan(150_000);
    const result = JSON.parse(line.slice(nonce.length)) as {
      kind: string;
      results: { status: number; body: string }[][];
    };
    expect(result.kind).toBe('completed');
    expect(result.results[0]).toHaveLength(60);
    expect(result.results[0]?.map((r) => (JSON.parse(r.body) as { path: string }).path)).toEqual(
      steps.map((s) => s.path),
    );
  });

  it('refuses URLs, protocol-relative paths and unknown methods without sending them', async () => {
    const nonce = '@@TEST2@@';
    const out = await probe({
      nonce,
      port: 8080,
      waitMs: 20_000,
      requestTimeoutMs: 5000,
      sequences: [
        [
          { method: 'GET', path: 'http://169.254.169.254/latest/meta-data/' },
          { method: 'GET', path: '//example.com/' },
          { method: 'CONNECT', path: '/' },
          { method: 'GET', path: '/ok' },
        ],
      ],
    });
    const line = out.split('\n').find((l) => l.startsWith(nonce)) ?? '';
    const responses = (
      JSON.parse(line.slice(nonce.length)) as { results: { status?: number; error?: string }[][] }
    ).results[0];
    expect(responses?.slice(0, 3).every((r) => r.status === undefined && r.error)).toBe(true);
    expect(responses?.[3]?.status).toBe(200);
  });
});
