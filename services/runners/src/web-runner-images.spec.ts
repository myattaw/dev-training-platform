import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { promisify } from 'node:util';
import { WEB_CHALLENGES } from '@pracstack/content/web-challenges';
import type { WebTest } from '@pracstack/content-model';
import {
  assembleProject,
  batchToTestRun,
  newBatchKey,
  type ProbeRequest,
  tarProject,
  toProbeRequests,
  verifyBatch,
  type WebBatchBody,
  type WebBatchLimits,
  type WebRunnerFramework,
} from '@pracstack/web-runner';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildContexts, buildLocalImages, localImage, WEB_RUNNERS } from '../scripts/build';
import { credentialsHidden, ENVIRON_PROBE, webProbeProject, webProbeRequest } from './probes';

/*
 * The web runner images, run locally with the Lambda Runtime Interface
 * Emulator the way Lambda runs them: a non-root user, a read-only filesystem
 * with a writable /tmp, Lambda's memory, and AWS credentials in the
 * function's environment (fake ones here). One container per framework is
 * reused across invocations, like a warm Lambda environment.
 *
 * Every response is verified with the run's key, as the trusted worker does.
 * Not testable locally: network isolation (from the VPC; see verify-runners).
 * Needs Docker; set PRACSTACK_SKIP_DOCKER_TESTS=1 to skip.
 */
const skip = process.env['PRACSTACK_SKIP_DOCKER_TESTS'] === '1';
const exec = promisify(execFile);
const FAKE_SECRETS = {
  AWS_ACCESS_KEY_ID: 'AKIAFAKEPRACSTACKTEST',
  AWS_SECRET_ACCESS_KEY: 'fake-secret-pracstack-test',
  AWS_SESSION_TOKEN: 'fake-session-pracstack-test',
};
/** Lambda memory per function (CPU is proportional: 1,769 MB = 1 vCPU). */
const MEMORY_MB: Record<WebRunnerFramework, number> = {
  aspnetcore: 3072,
  'spring-boot': 3072,
  django: 2048,
};

interface WebFn {
  run(
    files: Readonly<Record<string, string>>,
    sequences: readonly (readonly ProbeRequest[])[],
    extra?: { spring?: unknown; limits?: WebBatchLimits },
  ): Promise<WebBatchBody>;
  stop(): Promise<void>;
}

async function startWebFunction(framework: WebRunnerFramework): Promise<WebFn> {
  const env = Object.entries(FAKE_SECRETS).flatMap(([k, v]) => ['-e', `${k}=${v}`]);
  const memory = MEMORY_MB[framework];
  const { stdout } = await exec('docker', [
    'run',
    '-d',
    '--rm',
    '-p',
    '127.0.0.1::9000',
    '--user',
    '993:990',
    '--read-only',
    '--tmpfs',
    '/tmp:rw,exec,size=1024m',
    '--memory',
    `${memory}m`,
    '--memory-swap',
    `${memory}m`,
    '--cpus',
    (memory / 1769).toFixed(2),
    ...env,
    localImage(`web-${framework}`),
  ]);
  const id = stdout.trim();
  const port = (await exec('docker', ['port', id, '9000/tcp'])).stdout.trim().split(':').pop();
  const url = `http://127.0.0.1:${port}/2015-03-31/functions/function/invocations`;
  return {
    async run(files, sequences, extra = {}) {
      const runId = randomUUID();
      const key = newBatchKey();
      const payload = {
        runId,
        key,
        framework,
        tar: tarProject(files).toString('base64'),
        sequences,
        ...extra,
      };
      for (let attempt = 0; ; attempt++) {
        try {
          const res = await fetch(url, { method: 'POST', body: JSON.stringify(payload) });
          const body = verifyBatch(key, runId, await res.json());
          if (!body) throw new Error('The response failed verification.');
          return body;
        } catch (err) {
          if (attempt > 40 || (err as Error).message.includes('verification')) throw err;
          await new Promise((r) => setTimeout(r, 250));
        }
      }
    },
    stop: async () => void (await exec('docker', ['rm', '-f', id]).catch(() => undefined)),
  };
}

beforeAll(async () => {
  if (skip) return;
  await buildContexts();
  buildLocalImages(WEB_RUNNERS);
}, 1_800_000);

const FRAMEWORKS: readonly WebRunnerFramework[] = ['django', 'spring-boot', 'aspnetcore'];

describe.skipIf(skip).each(FRAMEWORKS)('%s web runner function', { timeout: 180_000 }, (fw) => {
  const entry = WEB_CHALLENGES.find((e) =>
    e.source.implementations.some((i) => i.framework === fw && i.status === 'available'),
  )!;
  const impl = entry.source.implementations.find((i) => i.framework === fw)!;
  const tests: readonly WebTest[] = [
    ...entry.source.challenge.visibleTests,
    ...entry.source.hiddenTests,
  ];
  const spring = impl.spring ? { spring: impl.spring } : {};
  let fn: WebFn;
  beforeAll(async () => {
    fn = await startWebFunction(fw);
  }, 60_000);
  afterAll(() => fn?.stop());

  it('runs the reference solution: every test passes; signed responses', async () => {
    const body = await fn.run(
      assembleProject(impl.starter, impl.reference),
      tests.map(toProbeRequests),
      spring,
    );
    const run = batchToTestRun(fw, body, tests);
    expect(run.kind, JSON.stringify(body.logs.slice(-20))).toBe('completed');
    if (run.kind !== 'completed') return;
    expect(run.results.filter((r) => !r.passed).map((r) => r.id)).toEqual([]);
    expect(body.timings['ready']).toBeGreaterThan(0);
  });

  it('runs the starter: some tests fail (the same environment, reused)', async () => {
    const body = await fn.run(
      assembleProject(impl.starter, {}),
      tests.map(toProbeRequests),
      spring,
    );
    const run = batchToTestRun(fw, body, tests);
    expect(run.kind).toBe('completed');
    if (run.kind === 'completed') expect(run.results.some((r) => !r.passed)).toBe(true);
  });

  it('reports a compilation error with a diagnostic', async () => {
    const [path, source] = Object.entries(impl.reference)[0]!;
    const body = await fn.run(
      assembleProject(impl.starter, {
        ...impl.reference,
        [path]: `${source}\n}}} this is not code (`,
      }),
      tests.map(toProbeRequests),
      spring,
    );
    const run = batchToTestRun(fw, body, tests);
    expect(run.kind).toBe('build-failed');
    if (run.kind === 'build-failed') expect(run.diagnostics.length).toBeGreaterThan(0);
  });
});

describe.skipIf(skip)('web runner isolation (Django image)', { timeout: 120_000 }, () => {
  let fn: WebFn;
  beforeAll(async () => {
    fn = await startWebFunction('django');
  }, 60_000);
  afterAll(() => fn?.stop());

  const probe = async (script: string) => {
    const body = await fn.run(webProbeProject(), [[webProbeRequest(script)]]);
    expect(body.kind, body.logs.join('\n')).toBe('completed');
    return body.results?.[0]?.[0]?.body ?? '';
  };

  it("the application cannot read the function's AWS credentials from any process", async () => {
    const out = await probe(ENVIRON_PROBE);
    expect(credentialsHidden(out), out).toBe(true);
    const all = await probe(
      "const fs=require('fs');console.log(fs.readdirSync('/proc').filter(n=>/^[0-9]+$/.test(n)).map(p=>{try{return fs.readFileSync('/proc/'+p+'/environ','utf8')}catch{return ''}}).join('\\n'))",
    );
    // Other processes' environments ARE readable (same OS user): the check is real.
    expect(all).toContain('AWS_LAMBDA_FUNCTION_NAME');
    for (const secret of Object.values(FAKE_SECRETS)) expect(all).not.toContain(secret);
  });

  it('nothing a run leaves behind (processes, files) survives into the next run', async () => {
    const planted = await probe(
      "const cp=require('child_process');cp.spawn('sleep',['600'],{detached:true,stdio:'ignore'}).unref();require('fs').writeFileSync('/tmp/planted.txt','x');console.log('planted')",
    );
    expect(planted.trim()).toBe('planted');
    const seen = await probe(
      "const fs=require('fs');const cmds=fs.readdirSync('/proc').filter(n=>/^[0-9]+$/.test(n)).map(p=>{try{return fs.readFileSync('/proc/'+p+'/cmdline','utf8')}catch{return ''}});console.log(JSON.stringify({file:fs.existsSync('/tmp/planted.txt'),sleepers:cmds.filter(c=>c.startsWith('sleep')).length}))",
    );
    expect(JSON.parse(seen)).toEqual({ file: false, sleepers: 0 });
  });

  it('an application that exits on start is a startup failure', async () => {
    const body = await fn.run(webProbeProject('exit'), [[{ method: 'GET', path: '/' }]]);
    expect(body.kind).toBe('startup-failed');
  });

  it('an application that never listens hits the startup time limit', async () => {
    const body = await fn.run(webProbeProject('hang'), [[{ method: 'GET', path: '/' }]], {
      limits: { startupTimeoutMs: 3_000 },
    });
    expect(body.kind).toBe('time-limit');
  });

  it('an application that uses too much memory is stopped (resource limit)', async () => {
    const body = await fn.run(webProbeProject(), [[{ method: 'GET', path: '/memory' }]]);
    expect(body.kind).toBe('resource-limit');
    expect(body.message).toMatch(/memory/);
  });

  it('still works after all of the above (the environment is clean)', async () => {
    expect((await probe("console.log('ok')")).trim()).toBe('ok');
  });
});
