import type {
  CreateWebRunRequest,
  CreateWebSessionRequest,
  CreateWebTimedSessionRequest,
  SaveWebDraftRequest,
  WebChallengeProgress,
  WebChallengeResponse,
  WebDraftResponse,
  WebHttpExchangeResponse,
  WebHttpRequest,
  WebProgressResponse,
  WebProjectResponse,
  WebRun,
  WebRunResponse,
  WebRunResult,
  WebSession,
  WebSessionResponse,
  WebSubmissionsResponse,
  WebSubmissionSummary,
  WebTimedSession,
  WebTimedSessionResponse,
  WebUsageResponse,
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
  type DockerWebRunner,
  runWebTests,
  validateSubmittedFiles,
  type WebApp,
  type WebProject,
  type WebRunnerFramework,
  type WebTestRun,
} from '@pracstack/web-runner';
import type { EntitlementService } from '../account/entitlements';
import type { Caller } from '../auth';
import { ApiError, badRequest, notFound } from '../http';
import type { WebStore, WebSubmissionRecord, WebTimedSessionRecord } from '../store/web-store';

/** A web challenge with its private data, as the content source provides it. */
export interface WebChallengeContent {
  readonly challenge: WebChallenge;
  readonly projects: readonly WebImplementation[];
  readonly grading: WebChallengeGrading;
}

/** Server-enforced execution limits (never browser timers). */
export interface WebExecutionPolicy {
  /** Builds per user per UTC day (runs, submissions and application sessions each count one). */
  readonly executionsPerDay: { readonly free: number; readonly pro: number };
  /**
   * Test runs one user may have building or running at once. Separately, each
   * user has at most one interactive application session (a new one replaces it).
   */
  readonly concurrentPerUser: number;
  /** Interactive session: hard lifetime and idle timeout. */
  readonly sessionLifetimeMs: number;
  readonly sessionIdleMs: number;
  /** HTTP-client requests per session. */
  readonly sessionRequestLimit: number;
}

export const DEFAULT_WEB_POLICY: WebExecutionPolicy = {
  executionsPerDay: { free: 40, pro: 200 },
  concurrentPerUser: 1,
  sessionLifetimeMs: 10 * 60_000,
  sessionIdleMs: 3 * 60_000,
  sessionRequestLimit: 200,
};

export interface WebChallengeServiceDeps {
  readonly findChallenge: (id: string) => WebChallengeContent | undefined;
  readonly store: WebStore;
  readonly entitlements: EntitlementService;
  /** Without a runner (e.g. on AWS until web execution is approved), challenges are browse-only. */
  readonly runner?: DockerWebRunner;
  readonly policy?: WebExecutionPolicy;
  readonly now: () => Date;
  readonly newId: () => string;
  readonly logError?: (err: unknown) => void;
}

interface RunJob {
  readonly userId: string;
  run: WebRun;
  readonly expiresAt: number;
}

interface SessionEntry {
  readonly userId: string;
  readonly app: WebApp;
  readonly id: string;
  readonly challengeId: string;
  readonly framework: WebFramework;
  readonly createdAt: string;
  readonly expiresAt: number;
  idleTimer: NodeJS.Timeout | undefined;
  lastUsed: number;
  requestsUsed: number;
}

const RUN_RETENTION_MS = 30 * 60_000;
const HEADER_NAME =
  /^(content-type|accept|authorization|if-match|if-none-match|x-[a-z0-9-]{1,40})$/i;
const REQUEST_PATH = /^\/(?!\/)[A-Za-z0-9\-._~!$&'()*+,;=:@%/?]{0,2047}$/;
const MAX_HTTP_BODY = 64 * 1024;

/**
 * Web Development Challenges on the API side. Everything that matters is
 * decided here, on the server: access (plan), which files may change, quotas,
 * concurrency, deadlines of timed sessions, and the grade. The browser only
 * ever sends editable files and requests, and reads results.
 */
export class WebChallengeService {
  private readonly policy: WebExecutionPolicy;
  private readonly runs = new Map<string, RunJob>();
  private readonly sessions = new Map<string, SessionEntry>();
  /** Test runs currently building or running, per user (sessions are one per user by design). */
  private readonly active = new Map<string, number>();

  constructor(private readonly deps: WebChallengeServiceDeps) {
    this.policy = deps.policy ?? DEFAULT_WEB_POLICY;
  }

  get executionAvailable(): boolean {
    return this.deps.runner !== undefined;
  }

  /* ---------- Catalog, details, projects ---------- */

  async detail(user: Caller, challengeId: string): Promise<WebChallengeResponse> {
    const content = await this.accessible(user, challengeId);
    const progress = (await this.deps.store.listWebProgress(user.id)).find(
      (p) => p.challengeId === challengeId,
    );
    return {
      challenge: content.challenge,
      progress: progress ? publicProgress(progress) : null,
      executionAvailable: this.executionAvailable,
    };
  }

  async project(
    user: Caller,
    challengeId: string,
    framework: WebFramework,
  ): Promise<WebProjectResponse> {
    const content = await this.accessible(user, challengeId);
    const project = content.projects.find((p) => p.framework === framework);
    if (!project) throw notFound('This challenge has no project for that framework.');
    if (project.status !== 'available') {
      throw new ApiError('not-found', 'This framework is coming soon for this challenge.');
    }
    return { challengeId, challengeVersion: content.challenge.version, project };
  }

  async progress(user: Caller): Promise<WebProgressResponse> {
    const records = await this.deps.store.listWebProgress(user.id);
    return { challenges: records.map(publicProgress) };
  }

  async history(user: Caller, challengeId: string): Promise<WebSubmissionsResponse> {
    await this.accessible(user, challengeId);
    const records = await this.deps.store.listWebSubmissions(user.id, challengeId, 20);
    return { submissions: records.map(summaryOf) };
  }

  async usage(user: Caller): Promise<WebUsageResponse> {
    const day = this.today();
    return {
      day,
      executionsUsed: await this.deps.store.getWebExecutions(user.id, day),
      executionsPerDay: await this.dailyLimit(user),
      concurrentLimit: this.policy.concurrentPerUser,
    };
  }

  /* ---------- Runs (visible tests) and submissions ---------- */

  async createRun(
    user: Caller,
    challengeId: string,
    request: CreateWebRunRequest,
  ): Promise<WebRunResponse> {
    const content = await this.accessible(user, challengeId);
    const { project, files } = this.prepare(content, request.framework, request.files);
    const acceptedAt = this.deps.now();

    let timed: WebTimedSessionRecord | undefined;
    if (request.timedSessionId !== undefined) {
      if (request.mode !== 'submit') throw badRequest('Timed sessions only take submissions.');
      timed = await this.liveTimedSession(user, request.timedSessionId, acceptedAt);
      if (timed.challengeId !== challengeId || timed.framework !== request.framework) {
        throw badRequest('This submission does not belong to that timed session.');
      }
    }
    const runner = this.requireRunner();
    await this.reserve(user, 'run');
    const run: WebRun = {
      id: this.deps.newId(),
      challengeId,
      framework: request.framework,
      mode: request.mode,
      status: 'queued',
      acceptedAt: acceptedAt.toISOString(),
      ...(timed ? { timedSessionId: timed.id } : {}),
    };
    const job: RunJob = {
      userId: user.id,
      run,
      expiresAt: acceptedAt.getTime() + RUN_RETENTION_MS,
    };
    this.runs.set(run.id, job);
    this.pruneRuns();
    // Grading continues after the response; the browser polls GET /api/web-runs/:id.
    void this.execute(job, runner, content, project, files, request.mode, timed?.id).finally(() =>
      this.releaseSlot(user.id),
    );
    return { run };
  }

  getRun(user: Caller, runId: string): WebRunResponse {
    const job = this.runs.get(runId);
    // Someone else's run is reported exactly like a missing one.
    if (!job || job.userId !== user.id) throw notFound('No such run.');
    return { run: job.run };
  }

  private async execute(
    job: RunJob,
    runner: DockerWebRunner,
    content: WebChallengeContent,
    project: WebProject,
    files: Readonly<Record<string, string>>,
    mode: 'visible' | 'submit',
    timedSessionId: string | undefined,
  ): Promise<void> {
    const visible = content.challenge.visibleTests;
    const hidden = mode === 'submit' ? content.grading.hiddenTests : [];
    const tests: readonly WebTest[] = [...visible, ...hidden];
    let outcome: WebTestRun;
    try {
      outcome = await runWebTests(runner, project, tests, {
        onApp: (app) =>
          app.onChange(() => {
            const status =
              app.state === 'building'
                ? 'building'
                : app.state === 'starting'
                  ? 'starting'
                  : app.state === 'ready'
                    ? 'testing'
                    : undefined;
            if (status && job.run.status !== 'completed') job.run = { ...job.run, status };
          }),
      });
    } catch (err) {
      this.deps.logError?.(err);
      outcome = { kind: 'unavailable', message: 'The application runner failed.' };
    }
    const result = toRunResult(outcome, visible.length, hidden, mode);
    let progress: WebChallengeProgress | undefined;
    if (mode === 'submit' && result.verdict !== 'infrastructure-error') {
      const hiddenPassed = result.hidden.filter((h) => h.passed).length;
      const record: WebSubmissionRecord = {
        id: job.run.id,
        userId: job.userId,
        challengeId: content.challenge.id,
        challengeVersion: content.challenge.version,
        framework: job.run.framework,
        verdict: result.verdict,
        visiblePassed: result.visible.filter((t) => t.passed).length,
        visibleTotal: visible.length,
        hiddenPassed,
        hiddenTotal: hidden.length,
        // The time the server accepted the submission: what timed sessions judge.
        submittedAt: job.run.acceptedAt,
        files,
        ...(timedSessionId ? { timedSessionId } : {}),
      };
      try {
        progress = publicProgress(await this.deps.store.recordWebSubmission(record));
        if (timedSessionId) await this.recordTimedSubmission(job.userId, timedSessionId, record);
      } catch (err) {
        this.deps.logError?.(err);
      }
    }
    job.run = { ...job.run, status: 'completed', result, ...(progress ? { progress } : {}) };
  }

  /* ---------- Interactive sessions (HTTP client) ---------- */

  async createSession(user: Caller, request: CreateWebSessionRequest): Promise<WebSessionResponse> {
    const content = await this.accessible(user, request.challengeId);
    const { project } = this.prepare(content, request.framework, request.files);
    const runner = this.requireRunner();
    // One live session per user: starting a new one replaces the old one.
    for (const entry of [...this.sessions.values()]) {
      if (entry.userId === user.id) await this.stopEntry(entry, 'stopped');
    }
    await this.reserve(user, 'session');
    const app = runner.start(project, { lifetimeMs: this.policy.sessionLifetimeMs });
    const now = this.deps.now();
    const entry: SessionEntry = {
      userId: user.id,
      app,
      id: this.deps.newId(),
      challengeId: request.challengeId,
      framework: request.framework,
      createdAt: now.toISOString(),
      expiresAt: now.getTime() + this.policy.sessionLifetimeMs,
      idleTimer: undefined,
      lastUsed: Date.now(),
      requestsUsed: 0,
    };
    this.sessions.set(entry.id, entry);
    let released = false;
    app.onChange(() => {
      if (
        !released &&
        [
          'build-failed',
          'startup-failed',
          'resource-limit',
          'expired',
          'stopped',
          'unavailable',
        ].includes(app.state)
      ) {
        released = true;
        if (entry.idleTimer) clearTimeout(entry.idleTimer);
      }
    });
    this.touch(entry);
    return { session: this.describeSession(entry) };
  }

  getSession(user: Caller, sessionId: string): WebSessionResponse {
    return { session: this.describeSession(this.ownSession(user, sessionId)) };
  }

  async stopSession(user: Caller, sessionId: string): Promise<WebSessionResponse> {
    const entry = this.ownSession(user, sessionId);
    await this.stopEntry(entry, 'stopped');
    return { session: this.describeSession(entry) };
  }

  async sendRequest(
    user: Caller,
    sessionId: string,
    request: WebHttpRequest,
  ): Promise<WebHttpExchangeResponse> {
    const entry = this.ownSession(user, sessionId);
    if (entry.app.state !== 'ready') {
      throw new ApiError(
        'conflict',
        'The application is not running. Start it again with Run application.',
      );
    }
    if (entry.requestsUsed >= this.policy.sessionRequestLimit) {
      throw new ApiError(
        'rate-limited',
        'This session has used all its requests. Restart the application.',
      );
    }
    entry.requestsUsed++;
    this.touch(entry);
    const result = await entry.app.send([
      [
        {
          method: request.method,
          path: request.path,
          ...(request.headers ? { headers: request.headers } : {}),
          ...(request.body !== undefined ? { body: request.body } : {}),
        },
      ],
    ]);
    const raw = result.kind === 'completed' ? result.results[0]?.[0] : undefined;
    return {
      response: raw
        ? {
            ...(raw.status !== undefined ? { status: raw.status } : {}),
            headers: raw.headers ?? {},
            body: raw.body ?? '',
            truncated: raw.truncated ?? false,
            ...(raw.durationMs !== undefined ? { durationMs: raw.durationMs } : {}),
            ...(raw.error ? { error: raw.error } : {}),
          }
        : {
            headers: {},
            body: '',
            truncated: false,
            error: result.kind === 'completed' ? 'No response.' : result.message,
          },
      session: this.describeSession(entry),
    };
  }

  /** Stops every application (server shutdown). */
  async shutdown(): Promise<void> {
    await Promise.all([...this.sessions.values()].map((e) => this.stopEntry(e, 'stopped')));
  }

  private touch(entry: SessionEntry): void {
    entry.lastUsed = Date.now();
    if (entry.idleTimer) clearTimeout(entry.idleTimer);
    entry.idleTimer = setTimeout(
      () => void this.stopEntry(entry, 'expired'),
      this.policy.sessionIdleMs,
    );
    entry.idleTimer.unref?.();
  }

  private async stopEntry(entry: SessionEntry, state: 'stopped' | 'expired'): Promise<void> {
    if (entry.idleTimer) clearTimeout(entry.idleTimer);
    await entry.app.stop(
      state,
      state === 'expired' ? 'The application was stopped after being idle.' : undefined,
    );
    // Keep stopped sessions briefly so the browser can read the final state.
    setTimeout(() => this.sessions.delete(entry.id), 5 * 60_000).unref?.();
  }

  private ownSession(user: Caller, sessionId: string): SessionEntry {
    const entry = this.sessions.get(sessionId);
    if (!entry || entry.userId !== user.id) throw notFound('No such application session.');
    return entry;
  }

  private describeSession(entry: SessionEntry): WebSession {
    const app = entry.app;
    return {
      id: entry.id,
      challengeId: entry.challengeId,
      framework: entry.framework,
      state: app.state,
      ...(app.stateMessage ? { message: app.stateMessage } : {}),
      diagnostics: app.diagnostics.map((d) => ({ ...d })),
      logs: app.logs().slice(-200),
      createdAt: entry.createdAt,
      expiresAt: new Date(
        Math.min(
          entry.expiresAt,
          Date.now() + this.policy.sessionIdleMs - (Date.now() - entry.lastUsed),
        ),
      ).toISOString(),
      requestsUsed: entry.requestsUsed,
      requestLimit: this.policy.sessionRequestLimit,
    };
  }

  /* ---------- Drafts ---------- */

  async getDraft(
    user: Caller,
    challengeId: string,
    framework: WebFramework,
  ): Promise<WebDraftResponse> {
    await this.accessible(user, challengeId);
    const record = await this.deps.store.getWebDraft(user.id, challengeId, framework);
    if (!record) return { draft: null };
    const { userId: _userId, ...draft } = record;
    return { draft };
  }

  async saveDraft(
    user: Caller,
    challengeId: string,
    framework: WebFramework,
    request: SaveWebDraftRequest,
  ): Promise<WebDraftResponse> {
    const content = await this.accessible(user, challengeId);
    const project = content.projects.find(
      (p) => p.framework === framework && p.status === 'available',
    );
    if (!project) throw notFound('This challenge has no project for that framework.');
    const validation = validateSubmittedFiles(
      request.files,
      project.files.filter((f) => f.editable).map((f) => f.path),
    );
    if (!validation.ok) throw badRequest(validation.message);
    const draft = {
      challengeId,
      framework,
      challengeVersion: request.challengeVersion,
      files: validation.files,
      updatedAt: this.deps.now().toISOString(),
    };
    await this.deps.store.putWebDraft({ userId: user.id, ...draft });
    return { draft };
  }

  async deleteDraft(
    user: Caller,
    challengeId: string,
    framework: WebFramework,
  ): Promise<WebDraftResponse> {
    await this.accessible(user, challengeId);
    await this.deps.store.deleteWebDraft(user.id, challengeId, framework);
    return { draft: null };
  }

  /* ---------- Timed sessions ---------- */

  async createTimedSession(
    user: Caller,
    request: CreateWebTimedSessionRequest,
  ): Promise<WebTimedSessionResponse> {
    const content = await this.accessible(user, request.challengeId);
    const project = content.projects.find(
      (p) => p.framework === request.framework && p.status === 'available',
    );
    if (!project) throw badRequest('That framework is not available for this challenge.');
    const now = this.deps.now();
    // An active session for the same challenge is resumed, not restarted (a reload
    // or a second click never resets the deadline).
    for (const existing of await this.deps.store.listWebTimedSessions(user.id)) {
      const current = await this.settleTimed(existing, now);
      if (current.status === 'active' && current.challengeId === request.challengeId) {
        return { session: publicTimed(current), serverTime: now.toISOString() };
      }
    }
    const record: WebTimedSessionRecord = {
      id: this.deps.newId(),
      userId: user.id,
      challengeId: request.challengeId,
      framework: request.framework,
      durationMinutes: request.durationMinutes,
      startedAt: now.toISOString(),
      deadline: new Date(now.getTime() + request.durationMinutes * 60_000).toISOString(),
      status: 'active',
      submissions: 0,
      revision: 1,
    };
    await this.deps.store.createWebTimedSession(record);
    return { session: publicTimed(record), serverTime: now.toISOString() };
  }

  async getTimedSession(user: Caller, id: string): Promise<WebTimedSessionResponse> {
    const now = this.deps.now();
    const record = await this.deps.store.getWebTimedSession(user.id, id);
    if (!record) throw notFound('No such timed session.');
    return {
      session: publicTimed(await this.settleTimed(record, now)),
      serverTime: now.toISOString(),
    };
  }

  async finishTimedSession(user: Caller, id: string): Promise<WebTimedSessionResponse> {
    const now = this.deps.now();
    for (let attempt = 0; attempt < 5; attempt++) {
      const record = await this.deps.store.getWebTimedSession(user.id, id);
      if (!record) throw notFound('No such timed session.');
      const settled = await this.settleTimed(record, now);
      if (settled.status !== 'active')
        return { session: publicTimed(settled), serverTime: now.toISOString() };
      const finished = { ...settled, status: 'completed' as const, finishedAt: now.toISOString() };
      if (await this.deps.store.updateWebTimedSession(finished, settled.revision)) {
        return { session: publicTimed(finished), serverTime: now.toISOString() };
      }
    }
    throw new ApiError('conflict', 'The session changed meanwhile. Try again.');
  }

  /** The session if it accepts submissions at `at`; otherwise a 409. */
  private async liveTimedSession(
    user: Caller,
    id: string,
    at: Date,
  ): Promise<WebTimedSessionRecord> {
    const record = await this.deps.store.getWebTimedSession(user.id, id);
    if (!record) throw notFound('No such timed session.');
    const settled = await this.settleTimed(record, at);
    if (settled.status !== 'active') {
      throw new ApiError(
        'session-expired',
        'This timed session has ended: no more submissions are accepted.',
      );
    }
    return settled;
  }

  /** Marks an active session whose deadline has passed as expired. */
  private async settleTimed(
    record: WebTimedSessionRecord,
    now: Date,
  ): Promise<WebTimedSessionRecord> {
    if (record.status !== 'active' || now.getTime() < Date.parse(record.deadline)) return record;
    const expired = { ...record, status: 'expired' as const, finishedAt: record.deadline };
    await this.deps.store.updateWebTimedSession(expired, record.revision);
    return { ...expired, revision: record.revision + 1 };
  }

  /**
   * Counts a submission that the server accepted before the deadline, even if
   * grading finished after it. The best result is kept.
   */
  private async recordTimedSubmission(
    userId: string,
    id: string,
    submission: WebSubmissionRecord,
  ): Promise<void> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const record = await this.deps.store.getWebTimedSession(userId, id);
      if (!record || Date.parse(submission.submittedAt) >= Date.parse(record.deadline)) return;
      const summary = summaryOf(submission);
      const better = !record.best || score(summary) > score(record.best);
      const next: WebTimedSessionRecord = {
        ...record,
        submissions: record.submissions + 1,
        ...(better ? { best: summary } : {}),
      };
      if (await this.deps.store.updateWebTimedSession(next, record.revision)) return;
    }
  }

  /* ---------- Shared checks ---------- */

  /** The challenge, if the caller's plan may open it (else 403); unknown ids are 404. */
  private async accessible(user: Caller, challengeId: string): Promise<WebChallengeContent> {
    const content = this.deps.findChallenge(challengeId);
    if (!content) throw notFound('No such web challenge.');
    if (content.challenge.access === 'pro') {
      await this.deps.entitlements.require(user, 'premium-web-challenges');
    }
    return content;
  }

  /** Validates the framework and the files; returns the project to run. */
  private prepare(
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

  private requireRunner(): DockerWebRunner {
    if (!this.deps.runner) {
      throw new ApiError(
        'unavailable',
        'Running web applications is not available on this server yet. You can read the challenge and edit the project.',
      );
    }
    return this.deps.runner;
  }

  /** Enforces the per-user concurrency limit (runs) and the daily quota (runs and sessions). */
  private async reserve(user: Caller, kind: 'run' | 'session'): Promise<void> {
    if (kind === 'run' && (this.active.get(user.id) ?? 0) >= this.policy.concurrentPerUser) {
      throw new ApiError(
        'conflict',
        'Your previous test run is still in progress. Wait for it to finish.',
      );
    }
    const limit = await this.dailyLimit(user);
    const usage = await this.deps.store.consumeWebExecution(user.id, this.today(), limit);
    if (!usage.allowed) {
      throw new ApiError(
        'rate-limited',
        `You have used today's ${limit} application runs. The limit resets at midnight UTC.`,
      );
    }
    if (kind === 'run') this.active.set(user.id, (this.active.get(user.id) ?? 0) + 1);
  }

  private releaseSlot(userId: string): void {
    const count = (this.active.get(userId) ?? 1) - 1;
    if (count <= 0) this.active.delete(userId);
    else this.active.set(userId, count);
  }

  private async dailyLimit(user: Caller): Promise<number> {
    const resolved = await this.deps.entitlements.resolve(user);
    return resolved.plan === 'free'
      ? this.policy.executionsPerDay.free
      : this.policy.executionsPerDay.pro;
  }

  private today(): string {
    return this.deps.now().toISOString().slice(0, 10);
  }

  private pruneRuns(): void {
    const now = this.deps.now().getTime();
    for (const [id, job] of this.runs) {
      if (job.expiresAt < now && job.run.status === 'completed') this.runs.delete(id);
    }
  }
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

function publicProgress(
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

function summaryOf(s: WebSubmissionRecord): WebSubmissionSummary {
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

function publicTimed(r: WebTimedSessionRecord): WebTimedSession {
  const { userId: _userId, revision: _revision, ...session } = r;
  return session;
}

const score = (s: WebSubmissionSummary): number =>
  (s.verdict === 'accepted' ? 1_000_000 : 0) + (s.visiblePassed + s.hiddenPassed) * 1000;

/** Validates an HTTP-client request (never trusted): method, relative path, approved headers, size. */
export function parseWebHttpRequest(body: unknown): WebHttpRequest {
  if (typeof body !== 'object' || body === null) throw badRequest('A request is required.');
  const b = body as Record<string, unknown>;
  const method = b['method'];
  if (
    method !== 'GET' &&
    method !== 'POST' &&
    method !== 'PUT' &&
    method !== 'PATCH' &&
    method !== 'DELETE'
  ) {
    throw badRequest('method must be GET, POST, PUT, PATCH or DELETE.');
  }
  const path = b['path'];
  if (
    typeof path !== 'string' ||
    !REQUEST_PATH.test(path) ||
    /^\/\//.test(path) ||
    path.includes('\\')
  ) {
    throw badRequest('path must be a relative application path such as /api/employees (no URLs).');
  }
  const headers: Record<string, string> = {};
  if (b['headers'] !== undefined) {
    if (typeof b['headers'] !== 'object' || b['headers'] === null || Array.isArray(b['headers'])) {
      throw badRequest('headers must be an object.');
    }
    const entries = Object.entries(b['headers'] as Record<string, unknown>);
    if (entries.length > 10) throw badRequest('At most 10 headers are allowed.');
    for (const [name, value] of entries) {
      if (!HEADER_NAME.test(name)) {
        throw badRequest(
          `Header "${name.slice(0, 64)}" is not allowed. Allowed: Content-Type, Accept, Authorization, If-Match, If-None-Match and X-… headers.`,
        );
      }
      if (typeof value !== 'string' || value.length > 1024 || /[\r\n\0]/.test(value)) {
        throw badRequest(`Header "${name}" must be a single line of at most 1024 characters.`);
      }
      headers[name] = value;
    }
  }
  const requestBody = b['body'];
  if (requestBody !== undefined && requestBody !== null) {
    if (typeof requestBody !== 'string' || Buffer.byteLength(requestBody) > MAX_HTTP_BODY) {
      throw badRequest('body must be text of at most 64 KB.');
    }
  }
  return {
    method,
    path,
    ...(Object.keys(headers).length ? { headers } : {}),
    ...(typeof requestBody === 'string' ? { body: requestBody } : {}),
  };
}
