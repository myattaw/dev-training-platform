import type {
  WebChallengeProgress,
  WebHttpRequest,
  WebHttpResponse,
  WebRunResult,
  WebSubmissionSummary,
  WebVerdict,
} from '@pracstack/api-contracts';
import type {
  WebChallenge,
  WebChallengeGrading,
  WebFramework,
  WebImplementation,
  WebTest,
} from '@pracstack/content-model';
import {
  assembleProject,
  type BatchRun,
  type ProbeResponse,
  validateSubmittedFiles,
  type WebProject,
  type WebRunnerFramework,
  type WebTestRun,
} from '@pracstack/web-runner';
import { badRequest } from '../http';
import type { WebStore, WebSubmissionRecord, WebTimedSessionRecord } from '../store/web-store';

/*
 * Logic shared by the API (WebChallengeService) and the web worker
 * (WebRunWorker): project assembly, results as learners see them, progress
 * and timed-session bookkeeping.
 */

/** A web challenge with its private data, as the content source provides it. */
export interface WebChallengeContent {
  readonly challenge: WebChallenge;
  readonly projects: readonly WebImplementation[];
  readonly grading: WebChallengeGrading;
}

/** Validates the framework and the files; returns the project to run. */
export function prepareProject(
  content: WebChallengeContent,
  framework: WebFramework,
  submitted: unknown,
): { project: WebProject; files: Readonly<Record<string, string>> } {
  const starter = content.projects.find((p) => p.framework === framework);
  const grading = content.grading.implementations.find((i) => i.framework === framework);
  if (!starter || !grading || starter.status !== 'available' || framework === 'angular') {
    throw badRequest('That framework is not available for this challenge.');
  }
  const editable = starter.files.filter((f) => f.editable).map((f) => f.path);
  const validation = validateSubmittedFiles(submitted, editable);
  if (!validation.ok) throw badRequest(validation.message);
  const starterFiles = Object.fromEntries(starter.files.map((f) => [f.path, f.content]));
  return {
    files: validation.files,
    project: {
      framework: framework as WebRunnerFramework,
      files: assembleProject(starterFiles, validation.files),
      ...(grading.spring ? { spring: grading.spring } : {}),
    },
  };
}

/** Turns a test run into what the learner sees. Hidden tests reveal only categories. */
export function toRunResult(
  outcome: WebTestRun,
  visibleCount: number,
  hidden: readonly WebTest[],
  mode: 'visible' | 'submit',
): WebRunResult {
  const base = { diagnostics: [], visible: [], hidden: [], logs: [] };
  // Application output can echo hidden-test requests: it is only returned for visible runs.
  const logs = (l: readonly string[]) => (mode === 'visible' ? l.slice(-200) : []);
  switch (outcome.kind) {
    case 'completed': {
      const visible = outcome.results.slice(0, visibleCount);
      const hiddenResults = outcome.results.slice(visibleCount).map((r, i) => ({
        category: hidden[i]?.category ?? 'hidden',
        passed: r.passed,
      }));
      const passed = outcome.results.every((r) => r.passed);
      const verdict: WebVerdict = passed ? 'accepted' : 'tests-failed';
      return {
        ...base,
        verdict: mode === 'visible' && passed ? 'accepted' : verdict,
        visible,
        hidden: hiddenResults,
        logs: logs(outcome.logs),
        durationMs: outcome.durationMs,
      };
    }
    case 'build-failed':
      return {
        ...base,
        verdict: 'compilation-error',
        message: 'The project did not compile.',
        diagnostics: outcome.diagnostics.map((d) => ({ ...d })),
        logs: logs(outcome.logs),
      };
    case 'startup-failed':
      return {
        ...base,
        verdict: 'startup-error',
        message: outcome.message,
        logs: logs(outcome.logs),
      };
    case 'time-limit':
      return {
        ...base,
        verdict: 'time-limit-exceeded',
        message: outcome.message,
        logs: logs(outcome.logs),
      };
    case 'resource-limit':
      return {
        ...base,
        verdict: 'resource-limit-exceeded',
        message: outcome.message,
        logs: logs(outcome.logs),
      };
    case 'unavailable':
      return {
        ...base,
        verdict: 'infrastructure-error',
        message: `${outcome.message} This was not caused by your code and does not count as an attempt.`,
      };
  }
}

/** Response bodies kept per request in an HTTP-client result. */
export const EXCHANGE_BODY_CHARS = 32 * 1024;

/**
 * Turns an HTTP-client batch (one sequence: the learner's requests, in order)
 * into what the learner sees: each request with its response, and the logs.
 * Not graded: a completed batch is `responded`, whatever the status codes.
 */
export function toRequestsResult(
  outcome: BatchRun,
  requests: readonly WebHttpRequest[],
): WebRunResult {
  if (outcome.kind !== 'completed') return toRunResult(outcome, 0, [], 'visible');
  const responses = outcome.responses[0] ?? [];
  return {
    verdict: 'responded',
    diagnostics: [],
    visible: [],
    hidden: [],
    logs: outcome.logs.slice(-200),
    durationMs: outcome.durationMs,
    exchanges: requests.map((request, i) => ({
      request,
      response: toHttpResponse(responses[i]),
    })),
  };
}

function toHttpResponse(raw: ProbeResponse | undefined): WebHttpResponse {
  if (!raw) {
    return {
      headers: {},
      body: '',
      truncated: false,
      error: 'No response: the application stopped before this request.',
    };
  }
  const body = raw.body ?? '';
  return {
    ...(raw.status !== undefined ? { status: raw.status } : {}),
    headers: raw.headers ?? {},
    body: body.slice(0, EXCHANGE_BODY_CHARS),
    truncated: (raw.truncated ?? false) || body.length > EXCHANGE_BODY_CHARS,
    ...(raw.durationMs !== undefined ? { durationMs: raw.durationMs } : {}),
    ...(raw.error ? { error: raw.error } : {}),
  };
}

export function publicProgress(
  p: WebChallengeProgress & { readonly userId?: string },
): WebChallengeProgress {
  return {
    challengeId: p.challengeId,
    attempts: p.attempts,
    solved: p.solved,
    frameworksSolved: [...p.frameworksSolved],
    frameworksAttempted: [...p.frameworksAttempted],
    ...(p.lastSubmittedAt ? { lastSubmittedAt: p.lastSubmittedAt } : {}),
    ...(p.solvedAt ? { solvedAt: p.solvedAt } : {}),
  };
}

export function summaryOf(s: WebSubmissionRecord): WebSubmissionSummary {
  return {
    id: s.id,
    challengeId: s.challengeId,
    challengeVersion: s.challengeVersion,
    framework: s.framework,
    verdict: s.verdict,
    visiblePassed: s.visiblePassed,
    visibleTotal: s.visibleTotal,
    hiddenPassed: s.hiddenPassed,
    hiddenTotal: s.hiddenTotal,
    submittedAt: s.submittedAt,
    ...(s.timedSessionId ? { timedSessionId: s.timedSessionId } : {}),
  };
}

const score = (s: WebSubmissionSummary): number =>
  (s.verdict === 'accepted' ? 1_000_000 : 0) + (s.visiblePassed + s.hiddenPassed) * 1000;

/**
 * Counts a submission that the server accepted before the deadline, even if
 * grading finished after it. The best result is kept.
 */
export async function recordTimedSubmission(
  store: WebStore,
  userId: string,
  id: string,
  submission: WebSubmissionRecord,
): Promise<void> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const record = await store.getWebTimedSession(userId, id);
    if (!record || Date.parse(submission.submittedAt) >= Date.parse(record.deadline)) return;
    const summary = summaryOf(submission);
    const better = !record.best || score(summary) > score(record.best);
    const next: WebTimedSessionRecord = {
      ...record,
      submissions: record.submissions + 1,
      ...(better ? { best: summary } : {}),
    };
    if (await store.updateWebTimedSession(next, record.revision)) return;
  }
}
