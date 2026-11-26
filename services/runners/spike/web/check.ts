/**
 * PHASE 0 SPIKE (not production code). Runs every web challenge's starter,
 * reference solution and mutants through the Lambda-style images under the
 * Runtime Interface Emulator, with Lambda's conditions (non-root user, read-only
 * image, writable /tmp only, Lambda's memory and its proportional CPU), and
 * checks the same expectations as content:check-web. One warm container per
 * framework is reused, like a warm Lambda environment.
 *
 *   npx tsx services/runners/spike/web/check.ts [aspnetcore|spring-boot|django ...]
 */
import { execFile } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { promisify } from 'node:util';
import { WEB_CHALLENGES } from '@pracstack/content/web-challenges';
import { gradeWebTest, type WebTest } from '@pracstack/content-model';
import {
  assembleProject,
  parseDiagnostics,
  tarProject,
  toProbeRequests,
  type WebRunnerFramework,
} from '@pracstack/web-runner';

const exec = promisify(execFile);
/** Lambda memory per function; CPU is proportional (1,769 MB = 1 vCPU). */
const MEMORY_MB: Record<WebRunnerFramework, number> = {
  aspnetcore: 4096,
  'spring-boot': 4096,
  django: 2048,
};

interface Row {
  challenge: string;
  framework: string;
  variant: string;
  ok: boolean;
  detail: string;
  kind: string;
  invokeMs: number;
  timings: Record<string, number>;
  peakRssMb: number;
  leftovers: { processes: number; tmpEntries: number };
  first: boolean;
}

async function startFunction(fw: WebRunnerFramework) {
  const mem = MEMORY_MB[fw];
  const { stdout } = await exec('docker', [
    'run',
    '-d',
    '--rm',
    '-p',
    '127.0.0.1::9000',
    '--user',
    '993:990',
    '--read-only',
    '--mount',
    'type=volume,dst=/tmp',
    '--memory',
    `${mem}m`,
    '--memory-swap',
    `${mem}m`,
    '--cpus',
    (mem / 1769).toFixed(2),
    '-e',
    'AWS_ACCESS_KEY_ID=AKIAFAKEPRACSTACKTEST',
    '-e',
    'AWS_SECRET_ACCESS_KEY=fake-secret-pracstack-test',
    '-e',
    'AWS_SESSION_TOKEN=fake-session-pracstack-test',
    '-e',
    'AWS_LAMBDA_FUNCTION_TIMEOUT=600',
    `pracstack-lambda-web-${fw}:spike`,
  ]);
  const id = stdout.trim();
  const port = (await exec('docker', ['port', id, '9000/tcp'])).stdout.trim().split(':').pop();
  const url = `http://127.0.0.1:${port}/2015-03-31/functions/function/invocations`;
  await new Promise((r) => setTimeout(r, 1500));
  return {
    id,
    invoke: async (payload: unknown) => {
      const res = await fetch(url, {
        method: 'POST',
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(600_000),
      });
      return (await res.json()) as {
        kind: string;
        message?: string;
        timings: Record<string, number>;
        peakRssMb: number;
        leftoversAtStart: { processes: number; tmpEntries: number };
        logs: string[];
        results?: unknown[][];
      };
    },
    stop: () => exec('docker', ['rm', '-f', id]).catch(() => undefined),
  };
}

async function main() {
  const frameworks = (
    process.argv.slice(2).length ? process.argv.slice(2) : ['django', 'spring-boot', 'aspnetcore']
  ) as WebRunnerFramework[];
  const rows: Row[] = [];
  mkdirSync('.local/phase0', { recursive: true });
  for (const fw of frameworks) {
    const fn = await startFunction(fw);
    let first = true;
    try {
      for (const entry of WEB_CHALLENGES) {
        const { challenge, hiddenTests, implementations } = entry.source;
        const impl = implementations.find((i) => i.framework === fw && i.status === 'available');
        if (!impl) continue;
        const tests: readonly WebTest[] = [...challenge.visibleTests, ...hiddenTests];
        const hiddenIds = new Set(hiddenTests.map((t) => t.id));
        const variants: [string, Readonly<Record<string, string>>][] = [
          ['starter', {}],
          ['reference', impl.reference],
          ...entry.mutants
            .filter((m) => m.framework === fw)
            .map(
              (m) =>
                [`mutant ${m.name}`, { ...impl.reference, ...m.files }] as [
                  string,
                  Record<string, string>,
                ],
            ),
        ];
        for (const [variant, files] of variants) {
          const project = assembleProject(impl.starter, files);
          const started = Date.now();
          const out = await fn.invoke({
            tar: tarProject(project).toString('base64'),
            ...(impl.spring ? { spring: impl.spring } : {}),
            sequences: tests.map(toProbeRequests),
          });
          const invokeMs = Date.now() - started;
          let ok = false;
          let detail = out.kind;
          if (out.kind === 'completed' && out.results) {
            const graded = tests.map((t, i) => gradeWebTest(t, (out.results?.[i] ?? []) as never));
            const failed = graded.filter((g) => !g.passed);
            if (variant === 'starter') {
              ok = failed.length > 0;
              detail = `${failed.length}/${graded.length} fail${ok ? ', as intended' : ' (starter passes everything!)'}`;
            } else if (variant === 'reference') {
              ok = failed.length === 0;
              detail = ok
                ? `all ${graded.length} pass`
                : `FAILED: ${failed.map((f) => f.id).join(', ')}`;
            } else {
              const caught = failed.filter((g) => hiddenIds.has(g.id)).map((g) => g.id);
              ok = caught.length > 0;
              detail = ok ? `caught by ${caught.join(', ')}` : 'NOT caught';
            }
          } else {
            const diags =
              out.kind === 'build-failed'
                ? parseDiagnostics(fw, out.logs)
                    .map((d) => `${d.file}:${d.line} ${d.message}`)
                    .slice(0, 3)
                    .join(' | ')
                : '';
            detail = `${out.kind}: ${out.message ?? ''} ${diags}\n    ${out.logs.slice(-8).join('\n    ')}`;
          }
          const row: Row = {
            challenge: challenge.id,
            framework: fw,
            variant,
            ok,
            detail,
            kind: out.kind,
            invokeMs,
            timings: out.timings,
            peakRssMb: out.peakRssMb,
            leftovers: out.leftoversAtStart,
            first,
          };
          first = false;
          rows.push(row);
          console.log(
            `${ok ? 'PASS' : 'FAIL'} ${fw} ${challenge.id} ${variant} ${(invokeMs / 1000).toFixed(1)}s build=${((out.timings?.['build-ok'] ?? out.timings?.['build-failed'] ?? 0) / 1000).toFixed(1)}s peak=${out.peakRssMb}MB left=${out.leftoversAtStart?.processes}/${out.leftoversAtStart?.tmpEntries} — ${detail}`,
          );
          writeFileSync('.local/phase0/results.json', JSON.stringify(rows, null, 2));
        }
      }
    } finally {
      await fn.stop();
    }
  }
  for (const fw of frameworks) {
    const r = rows.filter((x) => x.framework === fw);
    if (!r.length) continue;
    const times = r.map((x) => x.invokeMs).sort((a, b) => a - b);
    console.log(
      `\n== ${fw}: ${r.filter((x) => x.ok).length}/${r.length} ok; invoke median ${(times[Math.floor(times.length / 2)]! / 1000).toFixed(1)}s, max ${(times.at(-1)! / 1000).toFixed(1)}s, first ${(r[0]!.invokeMs / 1000).toFixed(1)}s; peak RSS ${Math.max(...r.map((x) => x.peakRssMb))} MB of ${MEMORY_MB[fw]} MB; leftovers seen at start: ${r.filter((x) => x.leftovers?.processes || x.leftovers?.tmpEntries).length}`,
    );
  }
}

await main();
