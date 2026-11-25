import type { ValidationIssue, WebFramework, WebTest } from '@pracstack/content-model';
import {
  assembleProject,
  type DockerWebRunner,
  runWebTests,
  type WebRunnerFramework,
  type WebTestRun,
} from '@pracstack/web-runner';
import type { WebChallengeEntry } from '../web-challenges';

/**
 * Proves each available web-challenge implementation against the real
 * framework runners (needs Docker and `npm run web-runners:build`):
 *
 * - the starter project builds, starts, and fails at least one test (it is
 *   really incomplete or broken, as the challenge says);
 * - the reference solution passes every visible and hidden test;
 * - every mutant (a plausible wrong solution) builds and fails at least one
 *   hidden test, so the hidden tests catch the mistakes they are meant to.
 */
export interface WebCheckResult {
  readonly challengeId: string;
  readonly framework: WebFramework;
  readonly variant: string;
  readonly ok: boolean;
  readonly detail: string;
  readonly durationMs: number;
}

const RUNNABLE: readonly WebFramework[] = ['aspnetcore', 'spring-boot', 'django'];

export async function checkWebChallenge(
  runner: DockerWebRunner,
  entry: WebChallengeEntry,
  only?: { readonly framework?: string },
): Promise<WebCheckResult[]> {
  const { challenge, hiddenTests, implementations } = entry.source;
  const tests: readonly WebTest[] = [...challenge.visibleTests, ...hiddenTests];
  const hiddenIds = new Set(hiddenTests.map((t) => t.id));
  const jobs: Promise<WebCheckResult>[] = [];

  for (const impl of implementations) {
    if (impl.status !== 'available' || !RUNNABLE.includes(impl.framework)) continue;
    if (only?.framework && impl.framework !== only.framework) continue;
    const project = (files: Readonly<Record<string, string>>) => ({
      framework: impl.framework as WebRunnerFramework,
      files: assembleProject(impl.starter, files),
      ...(impl.spring ? { spring: impl.spring } : {}),
    });
    const run = async (
      variant: string,
      files: Readonly<Record<string, string>>,
      judge: (run: WebTestRun) => { ok: boolean; detail: string },
    ): Promise<WebCheckResult> => {
      const started = Date.now();
      const result = await runWebTests(runner, project(files), tests);
      const verdict = judge(result);
      return {
        challengeId: challenge.id,
        framework: impl.framework,
        variant,
        ...verdict,
        durationMs: Date.now() - started,
      };
    };

    jobs.push(
      run('starter', {}, (r) =>
        r.kind !== 'completed'
          ? { ok: false, detail: `the starter must build and start: ${describe(r)}` }
          : r.results.every((t) => t.passed)
            ? { ok: false, detail: 'the starter already passes every test' }
            : {
                ok: true,
                detail: `${r.results.filter((t) => !t.passed).length}/${r.results.length} tests fail, as intended`,
              },
      ),
      run('reference', impl.reference, (r) => {
        if (r.kind !== 'completed') return { ok: false, detail: describe(r) };
        const failed = r.results.filter((t) => !t.passed);
        return failed.length === 0
          ? { ok: true, detail: `all ${r.results.length} tests pass` }
          : {
              ok: false,
              detail: failed
                .map((t) => {
                  const step = t.steps.find((s) => !s.passed);
                  return `${t.id}: ${step?.request} — ${step?.message} (got ${step?.actual ?? 'nothing'})`;
                })
                .join('\n'),
            };
      }),
    );
    for (const mutant of entry.mutants.filter((m) => m.framework === impl.framework)) {
      jobs.push(
        run(`mutant ${mutant.name}`, { ...impl.reference, ...mutant.files }, (r) => {
          if (r.kind !== 'completed') return { ok: false, detail: `mutants must build: ${describe(r)}` };
          const caught = r.results.filter((t) => !t.passed && hiddenIds.has(t.id)).map((t) => t.id);
          return caught.length > 0
            ? { ok: true, detail: `caught by ${caught.join(', ')}` }
            : { ok: false, detail: 'no hidden test catches this mutant' };
        }),
      );
    }
  }
  return Promise.all(jobs);
}

export function toIssues(results: readonly WebCheckResult[]): ValidationIssue[] {
  return results
    .filter((r) => !r.ok)
    .map((r) => ({
      severity: 'error' as const,
      path: `web-challenge:${r.challengeId}/${r.framework}/${r.variant}`,
      message: r.detail,
    }));
}

function describe(run: WebTestRun): string {
  switch (run.kind) {
    case 'completed':
      return 'completed';
    case 'build-failed':
      return `build failed: ${run.diagnostics.map((d) => `${d.file ?? ''}:${d.line ?? ''} ${d.message}`).join('; ')}`;
    case 'startup-failed':
    case 'resource-limit':
      return `${run.kind}: ${run.message}\n${run.logs.slice(-12).join('\n')}`;
    case 'unavailable':
      return `runner unavailable: ${run.message}`;
  }
}
