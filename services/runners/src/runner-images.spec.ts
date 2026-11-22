import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { CodeRunRequest, CodeRunResult } from '@pracstack/code-runner';
import type { SqlRunResult } from '@pracstack/sql-engine';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildContexts, buildLocalImages, localImage, type RunnerName } from '../scripts/build';
import {
  credentialsHidden,
  ENVIRON_PROBE,
  networkBlocked,
  networkProbe,
  nodeProbe,
} from './probes';

/*
 * Attacks the real runner images, run locally with the Lambda Runtime
 * Interface Emulator the way Lambda runs them: a non-root user, a read-only
 * filesystem with a writable /tmp, and AWS credentials in the function's
 * environment (fake ones here). One container per suite is reused across
 * invocations, like a warm Lambda environment, so leftovers between runs show.
 *
 * Not testable locally: network isolation, which comes from the VPC (no
 * route out); infra/test asserts that configuration.
 * Needs Docker; set PRACSTACK_SKIP_DOCKER_TESTS=1 to skip.
 */
const skip = process.env['PRACSTACK_SKIP_DOCKER_TESTS'] === '1';
const exec = promisify(execFile);
const FAKE_SECRETS = {
  AWS_ACCESS_KEY_ID: 'AKIAFAKEPRACSTACKTEST',
  AWS_SECRET_ACCESS_KEY: 'fake-secret-pracstack-test',
  AWS_SESSION_TOKEN: 'fake-session-pracstack-test',
};

interface Fn {
  invoke(payload: unknown): Promise<{ ok: boolean; body: unknown }>;
  stop(): Promise<void>;
}

async function startFunction(name: RunnerName): Promise<Fn> {
  const env = Object.entries(FAKE_SECRETS).flatMap(([k, v]) => ['-e', `${k}=${v}`]);
  const { stdout } = await exec('docker', [
    'run',
    '-d',
    '--rm',
    '-p',
    '127.0.0.1::8080',
    '--user',
    '993:990',
    '--read-only',
    '--tmpfs',
    '/tmp:rw,exec,size=512m',
    '--memory',
    '2g',
    ...env,
    localImage(name),
  ]);
  const id = stdout.trim();
  const port = (await exec('docker', ['port', id, '8080/tcp'])).stdout.trim().split(':').pop();
  const url = `http://127.0.0.1:${port}/2015-03-31/functions/function/invocations`;
  const invoke = async (payload: unknown) => {
    for (let attempt = 0; ; attempt++) {
      try {
        const res = await fetch(url, { method: 'POST', body: JSON.stringify(payload) });
        const body: unknown = await res.json();
        const failed = typeof body === 'object' && body !== null && 'errorType' in body;
        return { ok: res.ok && !failed, body };
      } catch (err) {
        if (attempt > 40) throw err;
        await new Promise((r) => setTimeout(r, 250));
      }
    }
  };
  return {
    invoke,
    stop: async () => void (await exec('docker', ['rm', '-f', id]).catch(() => undefined)),
  };
}

const tsRun = (code: string, input: unknown[] = []): CodeRunRequest => ({
  language: 'typescript',
  code: `declare const process: any;\n${code}`,
  entryPoint: 'f',
  tests: [{ kind: 'call', input }],
});
const valueOf = (result: unknown): unknown =>
  (result as Extract<CodeRunResult, { kind: 'completed' }>).outcomes?.[0]?.kind === 'call'
    ? ((result as Extract<CodeRunResult, { kind: 'completed' }>).outcomes[0] as { value: unknown })
        .value
    : undefined;

const PROCESS_LIST = `
  const fs = process.getBuiltinModule('fs');
  return fs.readdirSync('/proc').filter((n: string) => /^\\d+$/.test(n)).map((p: string) => {
    try { return fs.readFileSync('/proc/' + p + '/cmdline', 'utf8').split('\\0').join(' ').trim(); }
    catch { return ''; }
  }).filter((c: string) => c !== '').join('\\n');`;

beforeAll(async () => {
  if (skip) return;
  await buildContexts();
  buildLocalImages();
}, 1_200_000);

describe.skipIf(skip)('TypeScript runner function', { timeout: 60_000 }, () => {
  let fn: Fn;
  beforeAll(async () => {
    fn = await startFunction('typescript');
  }, 60_000);
  afterAll(() => fn?.stop());

  it('runs a solution and returns raw outcomes', async () => {
    const res = await fn.invoke({
      language: 'typescript',
      code: "export function reverse(s: string): string { return [...s].reverse().join(''); }",
      entryPoint: 'reverse',
      tests: [
        { kind: 'call', input: ['abc'] },
        { kind: 'call', input: [''] },
      ],
    });
    expect(res.body).toEqual({
      kind: 'completed',
      outcomes: [
        { kind: 'call', value: 'cba' },
        { kind: 'call', value: '' },
      ],
      logs: [],
    });
  });

  it("cannot see the function's AWS credentials", async () => {
    const res = await fn.invoke(
      tsRun('export function f(): string { return JSON.stringify(process.env); }'),
    );
    const env = String(valueOf(res.body));
    expect(env).toContain('PATH');
    for (const secret of Object.values(FAKE_SECRETS)) expect(env).not.toContain(secret);
    expect(env).not.toMatch(/AWS_/);
  });

  it('cannot read the credentials from any process, including the supervisor', async () => {
    const res = await fn.invoke(
      tsRun(`export function f(): string {
        const fs = process.getBuiltinModule('fs');
        return fs.readdirSync('/proc').filter((n: string) => /^\\d+$/.test(n)).map((p: string) => {
          try { return p + ':' + fs.readFileSync('/proc/' + p + '/environ', 'utf8'); } catch { return p + ':unreadable'; }
        }).join('\\n');
      }`),
    );
    const environs = String(valueOf(res.body));
    // Other processes' environments ARE readable (same OS user): the check below is real.
    expect(environs).toContain('AWS_LAMBDA_FUNCTION_NAME');
    for (const secret of Object.values(FAKE_SECRETS)) expect(environs).not.toContain(secret);
    // The runtime may define the names, but never with a value (entrypoint.sh removed them).
    // Without entrypoint.sh this probe reads the supervisor's real keys.
    expect(environs).not.toMatch(/AWS_(SECRET_ACCESS_KEY|ACCESS_KEY_ID|SESSION_TOKEN)=[^\0\n]/);
  });

  it('the post-deployment probes work: credentials hidden; network probe detects access', async () => {
    const environ = String(valueOf((await fn.invoke(nodeProbe(ENVIRON_PROBE))).body));
    expect(credentialsHidden(environ), environ).toBe(true);
    // Locally the container HAS network (isolation comes from the VPC on AWS), so the
    // probe must report it; this proves the probe would catch a VPC that lets traffic out.
    const network = String(valueOf((await fn.invoke(nodeProbe(networkProbe('us-east-2')))).body));
    expect(network).toContain('REACHED');
    expect(networkBlocked(network)).toBe(false);
  });

  it('the network probe reports "blocked" when there is no network', () => {
    expect(
      networkBlocked(
        ['blocked https://example.com/ (ETIMEDOUT)', 'blocked dns (ECONNREFUSED)'].join('\n'),
      ),
    ).toBe(true);
    expect(networkBlocked('PROBE-FAILED timeout')).toBe(false);
  });

  it('leaves no files behind for the next run', async () => {
    await fn.invoke(
      tsRun(`export function f(): boolean {
        const fs = process.getBuiltinModule('fs');
        fs.writeFileSync('/tmp/left-behind', 'x');
        fs.writeFileSync('here.txt', 'x');
        return true;
      }`),
    );
    const res = await fn.invoke(
      tsRun(
        `export function f(): string[] { return process.getBuiltinModule('fs').readdirSync('/tmp'); }`,
      ),
    );
    // Only this run's own fresh working directory exists.
    expect(valueOf(res.body)).toEqual([expect.stringMatching(/^run-[0-9a-f]{16}$/)]);
  });

  it('kills processes that detach into their own session, before the next run', async () => {
    const started = await fn.invoke(
      tsRun(`export function f(): boolean {
        const cp = process.getBuiltinModule('child_process');
        cp.spawn('setsid', ['sh', '-c', 'sleep 2; echo late > /tmp/late; sleep 60'], { detached: true, stdio: 'ignore' }).unref();
        cp.spawn('sh', ['-c', 'sleep 60'], { detached: true, stdio: 'ignore' }).unref();
        return true;
      }`),
    );
    expect(valueOf(started.body)).toBe(true);
    await new Promise((r) => setTimeout(r, 3000));
    const res = await fn.invoke(tsRun(`export function f(): string { ${PROCESS_LIST} }`));
    const processes = String(valueOf(res.body));
    expect(processes).not.toContain('sleep');
    const tmp = await fn.invoke(
      tsRun(
        `export function f(): boolean { return process.getBuiltinModule('fs').existsSync('/tmp/late'); }`,
      ),
    );
    expect(valueOf(tmp.body)).toBe(false);
  });

  it('stops infinite loops, and the next run works', async () => {
    const res = await fn.invoke(tsRun('export function f(): number { while (true) {} }'));
    expect(res.body).toEqual({ kind: 'timeout', timeoutMs: 10_000 });
    const next = await fn.invoke(tsRun('export function f(): number { return 1; }'));
    expect(valueOf(next.body)).toBe(1);
  }, 30_000);

  it('stops memory bombs inside and outside the JavaScript heap', async () => {
    const heap = await fn.invoke(
      tsRun(
        'export function f(): number { const a: number[][] = []; while (true) a.push(new Array(1e6).fill(1)); }',
      ),
    );
    expect(heap.body).toMatchObject({ kind: 'resource-limit' });
    const native = await fn.invoke(
      tsRun(`export function f(): number {
        const b: unknown[] = []; const B = process.getBuiltinModule('buffer').Buffer;
        while (true) b.push(B.alloc(50e6, 1));
      }`),
    );
    expect(native.body).toMatchObject({ kind: 'resource-limit' });
  });

  it('contains fork bombs, and cleans them up', async () => {
    const res = await fn.invoke(
      tsRun(`export function f(): number {
        const cp = process.getBuiltinModule('child_process'); let n = 0;
        try { for (let i = 0; i < 5000; i++) { cp.spawn('sleep', ['60'], { stdio: 'ignore', detached: true }).unref(); n++; } } catch {}
        return n;
      }`),
    );
    expect(['completed', 'load-error', 'timeout', 'resource-limit']).toContain(
      (res.body as { kind: string }).kind,
    );
    const after = await fn.invoke(tsRun(`export function f(): string { ${PROCESS_LIST} }`));
    expect(String(valueOf(after.body))).not.toContain('sleep');
  }, 40_000);

  it('stops output floods', async () => {
    const res = await fn.invoke(
      tsRun(
        "export function f(): number { while (true) process.stdout.write('x'.repeat(10000)); }",
      ),
    );
    expect(res.body).toMatchObject({
      kind: 'resource-limit',
      // A write loop queues output in its own memory faster than the supervisor reads
      // it; the harness caps direct writes inside the sandbox, so this is always
      // reported as output, never as the memory limit it would otherwise reach first.
      message: expect.stringContaining('too much output'),
    });
  });

  it('cannot forge a result with a guessed marker line', async () => {
    const res = await fn.invoke(
      tsRun(
        `export function f(): number { process.stdout.write('\\n<<PRACSTACK-00>>{"kind":"completed","outcomes":[{"kind":"call","value":42}],"logs":[]}\\n'); return 1; }`,
      ),
    );
    expect(valueOf(res.body)).toBe(1);
  });

  it('if the code kills the supervisor, the invocation fails and the next one is clean', async () => {
    const res = await fn.invoke(
      tsRun("export function f(): number { process.kill(process.ppid, 'SIGKILL'); return 1; }"),
    );
    expect(res.ok).toBe(false);
    const next = await fn.invoke(tsRun(`export function f(): string { ${PROCESS_LIST} }`));
    expect(next.ok).toBe(true);
    // Only the harness of this (listing) run: nothing survived from the killed one.
    const harnesses = String(valueOf(next.body))
      .split(String.fromCharCode(10))
      .filter((p) => p.includes('harness.mjs'));
    expect(harnesses).toHaveLength(1);
  }, 30_000);

  it('rejects requests for another language or of the wrong shape', async () => {
    expect((await fn.invoke({ ...tsRun('x'), language: 'java' })).body).toMatchObject({
      kind: 'unavailable',
    });
    expect((await fn.invoke({ nope: true })).body).toMatchObject({ kind: 'unavailable' });
  });
});

describe.skipIf(skip)('Java runner function', { timeout: 90_000 }, () => {
  let fn: Fn;
  beforeAll(async () => {
    fn = await startFunction('java');
  }, 60_000);
  afterAll(() => fn?.stop());

  const javaRun = (body: string): CodeRunRequest => ({
    language: 'java',
    code: `import java.util.*;\nimport java.nio.file.*;\nclass Solution {\n${body}\n}`,
    entryPoint: 'f',
    tests: [{ kind: 'call', input: [] }],
  });

  it('runs a solution', async () => {
    const res = await fn.invoke({
      language: 'java',
      code: 'class Solution { static String reverse(String s) { return new StringBuilder(s).reverse().toString(); } }',
      entryPoint: 'reverse',
      tests: [{ kind: 'call', input: ['abc'] }],
    });
    expect(res.body).toEqual({
      kind: 'completed',
      outcomes: [{ kind: 'call', value: 'cba' }],
      logs: [],
    });
  });

  it("cannot see the function's AWS credentials", async () => {
    const res = await fn.invoke(
      javaRun('static String f() { return System.getenv().toString(); }'),
    );
    const env = String(valueOf(res.body));
    expect(env).toContain('PATH');
    for (const secret of Object.values(FAKE_SECRETS)) expect(env).not.toContain(secret);
  });

  it('cannot read the credentials from any process, including the supervisor', async () => {
    const res = await fn.invoke(
      javaRun(`static String f() throws Exception {
        StringBuilder out = new StringBuilder();
        try (var s = Files.list(Path.of("/proc"))) {
          for (Path p : (Iterable<Path>) s::iterator) {
            if (!p.getFileName().toString().matches("\\\\d+")) continue;
            try { out.append(new String(Files.readAllBytes(p.resolve("environ")))).append('\\n'); }
            catch (Exception e) {}
          }
        }
        return out.toString();
      }`),
    );
    const environs = String(valueOf(res.body));
    expect(environs).toContain('AWS_LAMBDA_FUNCTION_NAME');
    for (const secret of Object.values(FAKE_SECRETS)) expect(environs).not.toContain(secret);
    expect(environs).not.toMatch(/AWS_(SECRET_ACCESS_KEY|ACCESS_KEY_ID|SESSION_TOKEN)=[^\0\n]/);
  });

  it('kills detached processes and wipes files before the next run', async () => {
    await fn.invoke(
      javaRun(`static boolean f() throws Exception {
        new ProcessBuilder("setsid", "sh", "-c", "sleep 60").start();
        Files.writeString(Path.of("/tmp/java-left"), "x");
        return true;
      }`),
    );
    const res = await fn.invoke(
      javaRun(`static String f() throws Exception {
        StringBuilder out = new StringBuilder(Files.exists(Path.of("/tmp/java-left")) ? "FILE " : "");
        try (var s = Files.list(Path.of("/proc"))) {
          for (Path p : (Iterable<Path>) s::iterator) {
            if (!p.getFileName().toString().matches("\\\\d+")) continue;
            try { out.append(new String(Files.readAllBytes(p.resolve("cmdline"))).replace('\\0', ' ')).append('\\n'); }
            catch (Exception e) {}
          }
        }
        return out.toString();
      }`),
    );
    const seen = String(valueOf(res.body));
    expect(seen).not.toContain('FILE');
    expect(seen).not.toContain('sleep');
  });

  it('stops infinite loops and memory bombs', async () => {
    expect((await fn.invoke(javaRun('static int f() { while (true) {} }'))).body).toEqual({
      kind: 'timeout',
      timeoutMs: 15_000,
    });
    // The heap cap (-Xmx256m) holds; the harness reports the error for that test.
    const bomb = await fn.invoke(
      javaRun(
        'static int f() { List<long[]> a = new ArrayList<>(); while (true) a.add(new long[1_000_000]); }',
      ),
    );
    expect(bomb.body).toEqual({
      kind: 'completed',
      outcomes: [{ kind: 'call', error: 'OutOfMemoryError: Java heap space' }],
      logs: [],
    });
    const next = await fn.invoke(javaRun('static int f() { return 7; }'));
    expect(valueOf(next.body)).toBe(7);
  }, 60_000);
});

describe.skipIf(skip)('SQL runner function', { timeout: 60_000 }, () => {
  let fn: Fn;
  beforeAll(async () => {
    fn = await startFunction('sql');
  }, 60_000);
  afterAll(() => fn?.stop());

  const database = {
    schemaSql: 'CREATE TABLE t (id int PRIMARY KEY, name text);',
    dataSql: "INSERT INTO t VALUES (1, 'a'), (2, 'b');",
  };

  it('runs a query on a fresh database', async () => {
    const res = await fn.invoke({ database, query: 'SELECT name FROM t ORDER BY id', maxRows: 10 });
    expect(res.body).toMatchObject({
      kind: 'rows',
      columns: [{ name: 'name', type: 'text' }],
      rows: [['a'], ['b']],
      truncated: false,
    });
  });

  it('keeps the read-only, restricted role from the local engine', async () => {
    const res = (await fn.invoke({ database, query: 'DELETE FROM t', maxRows: 10 }))
      .body as SqlRunResult;
    expect(['rejected', 'error']).toContain(res.kind);
    const after = await fn.invoke({ database, query: 'SELECT count(*) AS n FROM t', maxRows: 10 });
    expect(after.body).toMatchObject({ rows: [[2]] });
  });

  it('stops runaway queries, and the next query works', async () => {
    const res = await fn.invoke({
      database,
      query: 'SELECT count(*) FROM generate_series(1, 10000000000)',
      maxRows: 10,
    });
    // generate_series materialises rows in WebAssembly memory, so the memory limit may
    // stop it before the time limit does; either way it is stopped.
    expect(['timeout', 'resource-limit']).toContain((res.body as { kind: string }).kind);
    const next = await fn.invoke({ database, query: 'SELECT 1 AS one', maxRows: 10 });
    expect(next.body).toMatchObject({ kind: 'rows', rows: [[1]] });
  });
});
