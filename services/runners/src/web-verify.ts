/**
 * Isolation and correctness checks for the web runner functions. The same
 * code runs locally against the images under the Lambda Runtime Interface
 * Emulator (src/web-verify.spec.ts, networking off) and on AWS after a
 * deployment (infra/scripts/verify-runners.ts), where the network checks are
 * what the isolated VPC must guarantee.
 *
 * Every response must verify with its run's key, as the trusted worker requires.
 */
import { randomUUID } from 'node:crypto';
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
  type WebRunnerFramework,
} from '@pracstack/web-runner';
import {
  credentialsHidden,
  ENVIRON_PROBE,
  leftoverProbe,
  networkBlocked,
  networkProbe,
  READABLE_ENVIRON_PROBE,
  webProbeApp,
  webProbeRequest,
} from './probes';

/** Invokes a function synchronously and returns its JSON result; throws on a function error. */
export type RawInvoke = (functionName: string, payload: unknown) => Promise<unknown>;

export interface WebCheck {
  readonly name: string;
  readonly ok: boolean;
  readonly detail: string;
}

export const WEB_VERIFY_FRAMEWORKS: readonly WebRunnerFramework[] = [
  'django',
  'spring-boot',
  'aspnetcore',
];

/**
 * Tries to take the next invocation from Lambda's runtime API (which learner
 * code can reach on loopback). Prints one line: 'no-event …', or
 * 'EVENT-RECEIVED <request id> run <runId>' with the event's runId (never its key).
 *
 * Learner code receiving its OWN run's event is an accepted limit (decided
 * 2026-11-26, docs/lambda-web-runner.md "Phase 6"): it could sign a result for
 * its own run, which still needs the correct responses to pass. Receiving any
 * OTHER run's event fails the check.
 */
export const RUNTIME_API_PROBE = `
const fs = require('node:fs');
const http = require('node:http');
let api = process.env.AWS_LAMBDA_RUNTIME_API;
for (const pid of fs.readdirSync('/proc').filter((n) => /^[0-9]+$/.test(n))) {
  if (api) break;
  try {
    const line = fs.readFileSync('/proc/' + pid + '/environ', 'utf8').split(String.fromCharCode(0)).find((l) => l.startsWith('AWS_LAMBDA_RUNTIME_API='));
    if (line) api = line.slice('AWS_LAMBDA_RUNTIME_API='.length);
  } catch {}
}
if (!api) { console.log('no-event (runtime API address not visible)'); process.exit(0); }
const [host, port] = api.split(':');
const req = http.get({ host, port: Number(port), path: '/2018-06-01/runtime/invocation/next', timeout: 2500 }, (res) => {
  const id = res.headers['lambda-runtime-aws-request-id'];
  if (res.statusCode !== 200 || !id) { console.log('no-event (status ' + res.statusCode + ')'); process.exit(0); }
  let body = '';
  res.setEncoding('utf8');
  res.on('data', (c) => { body += c; });
  res.on('end', () => {
    let run = '?';
    try { run = String(JSON.parse(body).runId); } catch {}
    console.log('EVENT-RECEIVED ' + id + ' run ' + run);
    process.exit(0);
  });
});
req.on('timeout', () => { console.log('no-event (no answer)'); process.exit(0); });
req.on('error', (e) => { console.log('no-event (' + e.code + ')'); process.exit(0); });`;

/** Runs every check on the given web runner functions; never throws for a failed check. */
export async function verifyWebRunners(options: {
  readonly invoke: RawInvoke;
  readonly functions: Readonly<Record<WebRunnerFramework, string>>;
  /** For the AWS endpoint the network probe tries to reach. */
  readonly region: string;
  readonly onCheck?: (check: WebCheck) => void;
}): Promise<WebCheck[]> {
  const checks: WebCheck[] = [];
  const check = (name: string, ok: boolean, detail: string) => {
    const c = { name, ok, detail };
    checks.push(c);
    options.onCheck?.(c);
  };

  /** One batch; the verified body, or an error message. */
  const run = async (
    framework: WebRunnerFramework,
    files: Readonly<Record<string, string>>,
    sequences: readonly (readonly ProbeRequest[])[],
    spring?: unknown,
    runId: string = randomUUID(),
  ): Promise<WebBatchBody | string> => {
    const key = newBatchKey();
    let raw: unknown;
    try {
      raw = await options.invoke(options.functions[framework], {
        runId,
        key,
        framework,
        tar: tarProject(files).toString('base64'),
        sequences,
        ...(spring ? { spring } : {}),
      });
    } catch (err) {
      return `invoke failed: ${err instanceof Error ? err.message : String(err)}`;
    }
    // Bound to its key: verifying with any other key must fail.
    if (verifyBatch(newBatchKey(), runId, raw)) return 'a response verified with the wrong key';
    return verifyBatch(key, runId, raw) ?? 'the response failed signature verification';
  };

  for (const framework of WEB_VERIFY_FRAMEWORKS) {
    // 1. A real challenge: the reference solution passes every visible and hidden test.
    const entry = WEB_CHALLENGES.find((e) =>
      e.source.implementations.some((i) => i.framework === framework && i.status === 'available'),
    );
    const impl = entry?.source.implementations.find((i) => i.framework === framework);
    if (!entry || !impl) {
      check(`${framework}: reference solution`, false, 'no challenge for this framework');
      continue;
    }
    const tests: readonly WebTest[] = [
      ...entry.source.challenge.visibleTests,
      ...entry.source.hiddenTests,
    ];
    const reference = await run(
      framework,
      assembleProject(impl.starter, impl.reference),
      tests.map(toProbeRequests),
      impl.spring,
    );
    if (typeof reference === 'string') {
      check(`${framework}: runs the reference solution (signed)`, false, reference);
    } else {
      const graded = batchToTestRun(framework, reference, tests);
      const failed = graded.kind === 'completed' ? graded.results.filter((r) => !r.passed) : [];
      check(
        `${framework}: runs the reference solution (signed)`,
        graded.kind === 'completed' && failed.length === 0,
        graded.kind === 'completed'
          ? `${tests.length - failed.length}/${tests.length} tests, ${reference.timings['total'] ?? '?'} ms`
          : `${graded.kind}: ${reference.message ?? reference.logs.slice(-5).join(' | ')}`,
      );
    }

    // 2. Hostile probes from inside the learner's application, in one batch.
    const app = webProbeApp(framework);
    const probeRunId = randomUUID();
    const probes = await run(
      framework,
      app.files,
      [
        [
          { method: 'GET', path: '/' },
          webProbeRequest(networkProbe(options.region)),
          webProbeRequest(ENVIRON_PROBE),
          webProbeRequest(READABLE_ENVIRON_PROBE),
          webProbeRequest(RUNTIME_API_PROBE),
        ],
      ],
      app.spring,
      probeRunId,
    );
    const out = (i: number) =>
      typeof probes === 'string' ? '' : (probes.results?.[0]?.[i]?.body ?? '').trim();
    if (typeof probes === 'string' || probes.kind !== 'completed') {
      const why =
        typeof probes === 'string'
          ? probes
          : `${probes.kind}: ${probes.message ?? probes.logs.slice(-5).join(' | ')}`;
      check(`${framework}: probe application runs`, false, why);
      continue;
    }
    check(`${framework}: probe application runs`, out(0) === 'ok', out(0));
    check(
      `${framework}: no network from the application (HTTPS, raw IP, DNS)`,
      networkBlocked(out(1)),
      out(1).replace(/\n/g, '; '),
    );
    const readable = Number(out(3));
    check(
      `${framework}: no AWS credentials in any process`,
      credentialsHidden(out(2)) && readable > 0,
      `${out(2)}; ${readable} process environments readable (the check is real)`,
    );
    // Its own run's event is an accepted limit (see RUNTIME_API_PROBE); any other run's fails.
    const ownEvent = out(4).startsWith('EVENT-RECEIVED ') && out(4).endsWith(` run ${probeRunId}`);
    check(
      `${framework}: cannot take another run's invocation from the runtime API`,
      out(4).startsWith('no-event') || ownEvent,
      ownEvent ? `own event only (accepted limit): ${out(4)}` : out(4),
    );

    // 3. Nothing a run leaves behind survives into the next run in the same environment.
    let leftover: WebCheck | undefined;
    for (let attempt = 0; attempt < 3 && !leftover; attempt++) {
      const planted = await run(
        framework,
        app.files,
        [[webProbeRequest(leftoverProbe(true))]],
        app.spring,
      );
      const seen = await run(
        framework,
        app.files,
        [[webProbeRequest(leftoverProbe(false))]],
        app.spring,
      );
      if (typeof planted === 'string' || typeof seen === 'string') {
        leftover = {
          name: `${framework}: no leftovers between runs`,
          ok: false,
          detail: typeof planted === 'string' ? planted : String(seen),
        };
        break;
      }
      const parse = (b: WebBatchBody) => {
        try {
          return JSON.parse(b.results?.[0]?.[0]?.body ?? '') as {
            id: string;
            file: boolean;
            sleepers: number;
          };
        } catch {
          return undefined;
        }
      };
      const a = parse(planted);
      const b = parse(seen);
      if (!a || !b) {
        leftover = {
          name: `${framework}: no leftovers between runs`,
          ok: false,
          detail: 'the probe did not answer',
        };
      } else if (a.id === b.id) {
        leftover = {
          name: `${framework}: no leftovers between runs`,
          ok: !b.file && b.sleepers === 0,
          detail: `same environment; file left: ${b.file}, processes left: ${b.sleepers}`,
        };
      }
      // A different environment proves nothing: try again.
    }
    const result = leftover ?? {
      name: `${framework}: no leftovers between runs`,
      ok: false,
      detail: 'inconclusive: three pairs of runs never reused an environment',
    };
    check(result.name, result.ok, result.detail);
  }
  return checks;
}
