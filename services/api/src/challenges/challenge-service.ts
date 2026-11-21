import type {
  ChallengeCodeRequest,
  ChallengeProgressResponse,
  ChallengeRunResponse,
  ChallengeTestResult,
  ExecutionDetail,
  SubmissionListResponse,
  SubmissionResponse,
  SubmissionStatus,
  SubmissionSummary,
  UserInfo,
} from '@pracstack/api-contracts';
import { gradeOutcomes, toTestInput, type TestResult } from '@pracstack/challenge-runtime';
import type { CodeRunner, CodeRunResult } from '@pracstack/code-runner';
import type { ChallengeTest, LanguageSetup } from '@pracstack/content-model';
import type { ContentSource } from '../content/content-source';
import { ApiError, badRequest, notFound } from '../http';
import type { ProgressStore, SubmissionRecord } from '../store/progress-store';

const HISTORY_LIMIT = 20;

export interface ChallengeServiceDeps {
  readonly content: ContentSource;
  readonly store: ProgressStore;
  readonly runner?: CodeRunner;
  readonly now: () => Date;
  readonly newId: () => string;
}

/**
 * Server-side evaluation of coding challenges.
 *
 * Grading is split across a trust boundary. The runner container receives
 * the learner's code and test INPUTS only; it returns raw values. Expected
 * values never leave this service, and grading happens here, so code under
 * test cannot make a test pass without computing the right result.
 *
 * Hidden tests are reported as counts only: no inputs, outputs, error
 * messages or console output from hidden tests ever reach the learner.
 */
export class ChallengeService {
  constructor(private readonly deps: ChallengeServiceDeps) {}

  /** Visible tests only. Nothing is stored; used for Java (and any language) "Run tests". */
  async run(
    user: UserInfo,
    challengeId: string,
    request: ChallengeCodeRequest,
  ): Promise<ChallengeRunResponse> {
    const { challenge, setup } = this.find(challengeId, request.language);
    const started = Date.now();
    const result = await this.execute(request, setup, challenge.visibleTests);
    void user;
    return {
      detail: detailOf(result, challenge.visibleTests, setup.entryPoint),
      logs: 'logs' in result ? result.logs : [],
      durationMs: Date.now() - started,
    };
  }

  /** Visible and hidden tests, in one container run. Stored, and counts toward "solved". */
  async submit(
    user: UserInfo,
    challengeId: string,
    request: ChallengeCodeRequest,
  ): Promise<SubmissionResponse> {
    const { challenge, grading, setup } = this.find(challengeId, request.language);
    const visible = challenge.visibleTests;
    const hidden = grading.hiddenTests;
    const started = Date.now();
    const result = await this.execute(request, setup, [...visible, ...hidden]);
    const durationMs = Date.now() - started;

    let detail: ExecutionDetail;
    let status: SubmissionStatus;
    let visiblePassed = 0;
    let hiddenPassed = 0;
    if (result.kind === 'completed') {
      const graded = gradeOutcomes([...visible, ...hidden], result.outcomes, setup.entryPoint);
      const visibleResults = graded.slice(0, visible.length);
      visiblePassed = visibleResults.filter((r) => r.passed).length;
      hiddenPassed = graded.slice(visible.length).filter((r) => r.passed).length;
      status =
        visiblePassed === visible.length && hiddenPassed === hidden.length ? 'accepted' : 'failed';
      detail = {
        status: visiblePassed === visible.length ? 'passed' : 'failed',
        results: visibleResults.map(toPublicResult),
      };
    } else {
      detail = detailOf(result, visible, setup.entryPoint);
      status = statusOf(detail);
    }

    const submission: SubmissionRecord = {
      id: this.deps.newId(),
      userId: user.id,
      challengeId: challenge.id,
      challengeVersion: challenge.version,
      language: request.language,
      status,
      visiblePassed,
      visibleTotal: visible.length,
      hiddenPassed,
      hiddenTotal: hidden.length,
      durationMs,
      submittedAt: this.deps.now().toISOString(),
      code: request.code,
    };
    const before = (await this.deps.store.listChallengeProgress(user.id)).find(
      (p) => p.challengeId === challenge.id,
    );
    const progress = await this.deps.store.recordSubmission(submission);
    return {
      submission: toSummary(submission),
      detail,
      solvedNow: progress.solved && !before?.solved,
    };
  }

  async history(user: UserInfo, challengeId: string): Promise<SubmissionListResponse> {
    if (!this.deps.content.findChallenge(challengeId)) throw notFound('Unknown challenge.');
    const records = await this.deps.store.listSubmissions(user.id, challengeId, HISTORY_LIMIT);
    return { submissions: records.map(toSummary) };
  }

  async progress(user: UserInfo): Promise<ChallengeProgressResponse> {
    const records = await this.deps.store.listChallengeProgress(user.id);
    return {
      challenges: records.map(({ userId, ...progress }) => {
        void userId;
        return progress;
      }),
    };
  }

  private find(challengeId: string, language: ChallengeCodeRequest['language']) {
    const found = this.deps.content.findChallenge(challengeId);
    if (!found) throw notFound('Unknown challenge.');
    const setup = found.challenge.languages[language];
    if (!setup) throw badRequest(`This challenge cannot be solved in ${language}.`);
    return { ...found, setup };
  }

  private async execute(
    request: ChallengeCodeRequest,
    setup: LanguageSetup,
    tests: readonly ChallengeTest[],
  ): Promise<Exclude<CodeRunResult, { kind: 'unavailable' }>> {
    if (!this.deps.runner) {
      throw new ApiError('unavailable', 'Running code on the server is not available right now.');
    }
    const result = await this.deps.runner.run({
      language: request.language,
      code: request.code,
      entryPoint: setup.entryPoint,
      // Inputs only: expected values stay on this side of the boundary.
      tests: tests.map(toTestInput),
    });
    if (result.kind === 'unavailable') throw new ApiError('unavailable', result.message);
    return result;
  }
}

/** Describes a run without hidden tests (or a run that stopped before grading). */
function detailOf(
  result: Exclude<CodeRunResult, { kind: 'unavailable' }>,
  visible: readonly ChallengeTest[],
  entryPoint: string,
): ExecutionDetail {
  switch (result.kind) {
    case 'completed': {
      const results = gradeOutcomes(
        visible,
        result.outcomes.slice(0, visible.length),
        entryPoint,
      ).map(toPublicResult);
      return { status: results.every((r) => r.passed) ? 'passed' : 'failed', results };
    }
    case 'compile-error':
      return { status: 'compile-error', diagnostics: result.diagnostics };
    case 'load-error':
      return { status: 'runtime-error', message: result.message };
    case 'timeout':
      return { status: 'timeout', timeoutMs: result.timeoutMs };
    case 'resource-limit':
      return { status: 'resource-limit', message: result.message };
  }
}

function statusOf(detail: ExecutionDetail): SubmissionStatus {
  switch (detail.status) {
    case 'passed':
    case 'failed':
      return 'failed';
    default:
      return detail.status;
  }
}

function toPublicResult(r: TestResult): ChallengeTestResult {
  return {
    description: r.description,
    passed: r.passed,
    input: r.input,
    expected: r.expected,
    ...(r.actual !== undefined ? { actual: r.actual } : {}),
    ...(r.error !== undefined ? { error: r.error } : {}),
  };
}

function toSummary(record: SubmissionRecord): SubmissionSummary {
  return {
    id: record.id,
    challengeId: record.challengeId,
    challengeVersion: record.challengeVersion,
    language: record.language,
    status: record.status,
    visiblePassed: record.visiblePassed,
    visibleTotal: record.visibleTotal,
    hiddenPassed: record.hiddenPassed,
    hiddenTotal: record.hiddenTotal,
    durationMs: record.durationMs,
    submittedAt: record.submittedAt,
  };
}
