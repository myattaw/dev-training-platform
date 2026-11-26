import { gradeWebTest, type WebTest, type WebTestResult } from '@pracstack/content-model';
import type { DockerWebRunner, WebApp } from './docker-web-runner';
import type {
  AppState,
  BuildDiagnostic,
  ProbeRequest,
  ProbeResponse,
  WebProject,
} from './protocol';

/** The outcome of building a project and running tests against it. */
export type WebTestRun =
  | {
      readonly kind: 'completed';
      readonly results: readonly WebTestResult[];
      /** Recent application output (untrusted text, for the learner's own run). */
      readonly logs: readonly string[];
      readonly durationMs: number;
    }
  | {
      readonly kind: 'build-failed';
      readonly diagnostics: readonly BuildDiagnostic[];
      readonly logs: readonly string[];
    }
  | { readonly kind: 'startup-failed'; readonly message: string; readonly logs: readonly string[] }
  /** Out of memory or too much output: the learner's code hit a limit. */
  | { readonly kind: 'resource-limit'; readonly message: string; readonly logs: readonly string[] }
  /** The build or the application ran past its deadline. */
  | { readonly kind: 'time-limit'; readonly message: string; readonly logs: readonly string[] }
  /** Docker, an image or the probe failed: never the learner's fault, never graded. */
  | { readonly kind: 'unavailable'; readonly message: string };

/**
 * The outcome of one batch (build, start, send request sequences), before
 * grading: raw responses, or why there are none. Docker and Lambda runs both
 * produce it; the trusted side grades it (gradeBatch).
 */
export type BatchRun =
  | {
      readonly kind: 'completed';
      /** One list of responses per sequence (untrusted data). */
      readonly responses: readonly (readonly ProbeResponse[])[];
      readonly logs: readonly string[];
      readonly durationMs: number;
    }
  | Exclude<WebTestRun, { readonly kind: 'completed' }>;

/** Grades a batch whose sequences were `tests.map(toProbeRequests)`. */
export function gradeBatch(run: BatchRun, tests: readonly WebTest[]): WebTestRun {
  if (run.kind !== 'completed') return run;
  return {
    kind: 'completed',
    results: tests.map((test, i) => gradeWebTest(test, run.responses[i] ?? [])),
    logs: run.logs,
    durationMs: run.durationMs,
  };
}

/** Turns test steps into probe requests (requests only: no expectations leave the API). */
export function toProbeRequests(test: WebTest): ProbeRequest[] {
  return test.steps.map((step) => ({
    method: step.request.method,
    path: step.request.path,
    ...(step.request.headers ? { headers: step.request.headers } : {}),
    ...(step.request.body !== undefined ? { body: step.request.body } : {}),
    ...(step.capture ? { capture: step.capture } : {}),
  }));
}

/** Where a batch is, for progress display. */
export type BatchPhase = 'building' | 'starting' | 'testing';

/**
 * Builds and starts the project in a throwaway container, sends the request
 * sequences in order against that one application instance, and always stops
 * the container. Never throws for learner mistakes.
 */
export async function runBatch(
  runner: DockerWebRunner,
  project: WebProject,
  sequences: readonly (readonly ProbeRequest[])[],
  options: { readonly onApp?: (app: WebApp) => void } = {},
): Promise<BatchRun> {
  const started = Date.now();
  const app = runner.start(project, { lifetimeMs: 5 * 60_000 });
  options.onApp?.(app);
  try {
    const state = await app.settled();
    if (state !== 'ready') return notReady(app, state);
    const result = await app.send(sequences);
    if (result.kind === 'unavailable') return { kind: 'unavailable', message: result.message };
    if (result.kind === 'not-ready') {
      // The application died while the requests ran (e.g. it exited on a request).
      const final = app.state === 'ready' ? 'startup-failed' : app.state;
      return notReady(
        app,
        final === 'resource-limit' ? final : 'startup-failed',
        'The application stopped while the tests were running.',
      );
    }
    return {
      kind: 'completed',
      responses: result.results,
      logs: app.logs(),
      durationMs: Date.now() - started,
    };
  } finally {
    await app.stop('stopped');
  }
}

/**
 * Builds and starts the project, runs the tests in order against that one
 * application instance, grades the responses here (trusted side), and always
 * stops the container.
 */
export async function runWebTests(
  runner: DockerWebRunner,
  project: WebProject,
  tests: readonly WebTest[],
  options: { readonly onApp?: (app: WebApp) => void } = {},
): Promise<WebTestRun> {
  return gradeBatch(await runBatch(runner, project, tests.map(toProbeRequests), options), tests);
}

function notReady(app: WebApp, state: AppState, message?: string): BatchRun {
  const logs = app.logs();
  switch (state) {
    case 'build-failed':
      return { kind: 'build-failed', diagnostics: app.diagnostics, logs };
    case 'resource-limit':
      return {
        kind: 'resource-limit',
        message: message ?? app.stateMessage ?? 'A resource limit was reached.',
        logs,
      };
    case 'expired':
      return { kind: 'time-limit', message: app.stateMessage ?? 'A time limit was reached.', logs };
    case 'unavailable':
      return {
        kind: 'unavailable',
        message: app.stateMessage ?? 'The application runner is not available.',
      };
    default:
      return {
        kind: 'startup-failed',
        message: message ?? app.stateMessage ?? 'The application did not start.',
        logs,
      };
  }
}
