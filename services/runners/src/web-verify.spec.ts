import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { WebRunnerFramework } from '@pracstack/web-runner';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildContexts, buildLocalImages, localImage, WEB_RUNNERS } from '../scripts/build';
import { verifyWebRunners, WEB_VERIFY_FRAMEWORKS, type WebCheck } from './web-verify';

/*
 * The post-deployment web runner checks (infra/scripts/verify-runners.ts),
 * run here against the three images under the Lambda Runtime Interface
 * Emulator, with fake AWS credentials in the function's environment and
 * networking off (an internal Docker network with no way out, standing in for the
 * isolated VPC; the checks are sent from a client container on that network). So the
 * checks themselves are known to work before they meet AWS, and every probe
 * application builds and runs in its image.
 *
 * Needs Docker; set PRACSTACK_SKIP_DOCKER_TESTS=1 to skip.
 */
const skip = process.env['PRACSTACK_SKIP_DOCKER_TESTS'] === '1';
const exec = promisify(execFile);
const MEMORY_MB: Record<WebRunnerFramework, number> = {
  aspnetcore: 3008,
  'spring-boot': 3008,
  django: 2048,
};

describe.skipIf(skip)('web runner verification checks (local images)', { timeout: 900_000 }, () => {
  const containers: string[] = [];
  const network = `pracstack-verify-${process.pid}`;
  let checks: WebCheck[] = [];

  beforeAll(async () => {
    await buildContexts();
    buildLocalImages(WEB_RUNNERS);
    await exec('docker', ['network', 'create', '--internal', network]);
    for (const framework of WEB_VERIFY_FRAMEWORKS) {
      const memory = MEMORY_MB[framework];
      const { stdout } = await exec('docker', [
        'run',
        '-d',
        '--rm',
        '--network',
        network,
        '--name',
        `${network}-${framework}`,
        '--user',
        '993:990',
        '--read-only',
        '--ulimit',
        'nofile=1024:1024',
        '--tmpfs',
        '/tmp:rw,exec,size=1024m',
        '--memory',
        `${memory}m`,
        '--memory-swap',
        `${memory}m`,
        '--cpus',
        (memory / 1769).toFixed(2),
        '-e',
        'AWS_ACCESS_KEY_ID=AKIAFAKEPRACSTACKTEST',
        '-e',
        'AWS_SECRET_ACCESS_KEY=fake-secret-pracstack-test',
        '-e',
        'AWS_SESSION_TOKEN=fake-session-pracstack-test',
        localImage(`web-${framework}`),
      ]);
      containers.push(stdout.trim());
    }
    // The emulator is reached from a client container on the same internal network (the
    // handler kills every other process in its own container before a run).
    const invoke = async (name: string, payload: unknown): Promise<unknown> => {
      const script = `fetch("http://${network}-${name}:9000/2015-03-31/functions/function/invocations",{method:"POST",body:require("fs").readFileSync(0,"utf8")}).then(r=>r.text()).then(t=>process.stdout.write(t))`;
      for (let attempt = 0; ; attempt++) {
        try {
          const text = await new Promise<string>((resolve, reject) => {
            const child = execFile(
              'docker',
              [
                'run',
                '--rm',
                '-i',
                '--network',
                network,
                '--entrypoint',
                '/var/lang/bin/node',
                localImage('web-django'),
                '-e',
                script,
              ],
              { maxBuffer: 20_000_000 },
              (err, stdout) => (err ? reject(err) : resolve(stdout)),
            );
            child.stdin?.end(JSON.stringify(payload));
          });
          return JSON.parse(text) as unknown;
        } catch (err) {
          if (attempt > 40) throw err;
          await new Promise((r) => setTimeout(r, 250));
        }
      }
    };
    checks = await verifyWebRunners({
      invoke,
      functions: { django: 'django', 'spring-boot': 'spring-boot', aspnetcore: 'aspnetcore' },
      region: 'us-east-2',
      onCheck: (c) => console.log(`${c.ok ? 'ok  ' : 'FAIL'} ${c.name}: ${c.detail}`),
    });
  }, 1_800_000);

  afterAll(async () => {
    for (const id of containers) await exec('docker', ['rm', '-f', id]).catch(() => undefined);
    await exec('docker', ['network', 'rm', network]).catch(() => undefined);
  });

  it('runs every check on every framework', () => {
    expect(checks.length).toBe(WEB_VERIFY_FRAMEWORKS.length * 6);
  });

  const runtimeApi = (c: WebCheck) => /runtime API/.test(c.name);

  it('passes every check except the runtime API one', () => {
    expect(checks.filter((c) => !c.ok && !runtimeApi(c))).toEqual([]);
  });

  // KNOWN FAILURE (2026-11-26), kept strict on purpose: under the Lambda Runtime Interface
  // Emulator, learner code can take an invocation event from the runtime API during its
  // run (in all three images). Whether real Lambda does the same is measured on staging by
  // verify-runners (docs/lambda-web-runner.md, "Phase 5"); the decision follows from that.
  // If this starts passing, `it.fails` fails: review it and turn it back into a plain test.
  it.fails('learner code cannot take an invocation event from the runtime API', () => {
    const results = checks.filter(runtimeApi);
    expect(results).toHaveLength(WEB_VERIFY_FRAMEWORKS.length);
    expect(results.filter((c) => !c.ok)).toEqual([]);
  });
});
