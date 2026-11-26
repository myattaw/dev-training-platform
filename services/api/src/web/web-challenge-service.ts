import type {
  CreateWebRunRequest,
  CreateWebTimedSessionRequest,
  SaveWebDraftRequest,
  WebChallengeResponse,
  WebDraftResponse,
  WebProgressResponse,
  WebProjectResponse,
  WebRun,
  WebRunResponse,
  WebSubmissionsResponse,
  WebTimedSession,
  WebTimedSessionResponse,
  WebUsageResponse,
} from '@pracstack/api-contracts';
import type { WebFramework } from '@pracstack/content-model';
import { validateSubmittedFiles } from '@pracstack/web-runner';
import type { EntitlementService } from '../account/entitlements';
import type { Caller } from '../auth';
import { ApiError, badRequest, notFound } from '../http';
import type { WebRunRecord, WebStore, WebTimedSessionRecord } from '../store/web-store';
import { prepareProject, publicProgress, summaryOf, type WebChallengeContent } from './web-shared';

export type { WebChallengeContent } from './web-shared';
export { toRunResult } from './web-shared';

/** Server-enforced execution limits (never browser timers). */
export interface WebExecutionPolicy {
  /** Builds per user per UTC day (test runs, submissions and HTTP-client runs each count one). */
  readonly executionsPerDay: { readonly free: number; readonly pro: number };
  /** Runs (of any mode) one user may have building or running at once. */
  readonly concurrentPerUser: number;
  /** Runs building or running at once across all users (enforced by the web worker). */
  readonly concurrentGlobal?: number;
}

export const DEFAULT_WEB_POLICY: WebExecutionPolicy = {
  executionsPerDay: { free: 40, pro: 200 },
  concurrentPerUser: 1,
  concurrentGlobal: 2,
};

/** How long a run record is kept for polling. */
export const RUN_RETENTION_MS = 24 * 60 * 60_000;
/** A run's per-user slot expires after this, even if its worker died. */
export const RUN_LEASE_MS = 10 * 60_000;
export const userRunLease = (userId: string): string => `user-runs#${userId}`;

/**
 * Hands a stored, queued run to the web worker. Locally the worker runs in
 * this process; on AWS it is a separate function, invoked asynchronously.
 */
export type WebRunDispatch = (userId: string, runId: string) => Promise<void>;

export interface WebChallengeServiceDeps {
  readonly findChallenge: (id: string) => WebChallengeContent | undefined;
  readonly store: WebStore;
  readonly entitlements: EntitlementService;
  /** Where runs go (see WebRunWorker). Without it, web challenges are browse-only. */
  readonly dispatch?: WebRunDispatch;
  readonly policy?: WebExecutionPolicy;
  readonly now: () => Date;
  readonly newId: () => string;
  readonly logError?: (err: unknown) => void;
}

/**
 * Web Development Challenges on the API side. Everything that matters is
 * decided here, on the server: access (plan), which files may change, quotas,
 * concurrency, deadlines of timed sessions, and the grade. The browser only
 * ever sends editable files and requests, and reads results.
 */
export class WebChallengeService {
  private readonly policy: WebExecutionPolicy;

  constructor(private readonly deps: WebChallengeServiceDeps) {
    this.policy = deps.policy ?? DEFAULT_WEB_POLICY;
  }

  get executionAvailable(): boolean {
    return this.deps.dispatch !== undefined;
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
    const { files } = prepareProject(content, request.framework, request.files);
    const acceptedAt = this.deps.now();

    let timed: WebTimedSessionRecord | undefined;
    if (request.timedSessionId !== undefined) {
      if (request.mode !== 'submit') throw badRequest('Timed sessions only take submissions.');
      timed = await this.liveTimedSession(user, request.timedSessionId, acceptedAt);
      if (timed.challengeId !== challengeId || timed.framework !== request.framework) {
        throw badRequest('This submission does not belong to that timed session.');
      }
    }
    const dispatch = this.deps.dispatch;
    if (!dispatch) throw unavailable();
    const id = this.deps.newId();
    const lease = userRunLease(user.id);
    const nowMs = acceptedAt.getTime();
    const slot = await this.deps.store.acquireWebLease(
      lease,
      id,
      this.policy.concurrentPerUser,
      nowMs,
      nowMs + RUN_LEASE_MS,
    );
    if (!slot) {
      throw new ApiError(
        'conflict',
        'Your previous run is still in progress. Wait for it to finish.',
      );
    }
    try {
      await this.consumeQuota(user);
    } catch (err) {
      await this.deps.store.releaseWebLease(lease, id);
      throw err;
    }
    const run: WebRunRecord = {
      id,
      userId: user.id,
      challengeId,
      framework: request.framework,
      mode: request.mode,
      status: 'queued',
      acceptedAt: acceptedAt.toISOString(),
      files,
      expiresAt: nowMs + RUN_RETENTION_MS,
      ...(timed ? { timedSessionId: timed.id } : {}),
      ...(request.mode === 'requests' ? { requests: request.requests ?? [] } : {}),
    };
    await this.deps.store.createWebRun(run);
    // Grading continues elsewhere; the browser polls GET /api/web-runs/:id.
    try {
      await dispatch(user.id, id);
    } catch (err) {
      this.deps.logError?.(err);
      // Not the learner's fault: the run ends at once as an infrastructure error.
      await this.deps.store.updateWebRun(
        {
          ...run,
          status: 'completed',
          result: {
            verdict: 'infrastructure-error',
            message:
              'The run could not be started. This was not caused by your code and does not count as an attempt.',
            diagnostics: [],
            visible: [],
            hidden: [],
            logs: [],
          },
        },
        'queued',
      );
      await this.deps.store.releaseWebLease(lease, id);
    }
    const stored = (await this.deps.store.getWebRun(user.id, id)) ?? run;
    return { run: publicRun(stored) };
  }

  async getRun(user: Caller, runId: string): Promise<WebRunResponse> {
    // Runs are stored per user: someone else's run is reported exactly like a missing one.
    const run = await this.deps.store.getWebRun(user.id, runId);
    if (!run) throw notFound('No such run.');
    return { run: publicRun(run) };
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
    return {
      draft: {
        challengeId: record.challengeId,
        framework: record.framework,
        challengeVersion: record.challengeVersion,
        files: record.files,
        updatedAt: record.updatedAt,
      },
    };
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

  /** Counts one build against the caller's daily quota, or refuses. */
  private async consumeQuota(user: Caller): Promise<void> {
    const limit = await this.dailyLimit(user);
    const usage = await this.deps.store.consumeWebExecution(user.id, this.today(), limit);
    if (!usage.allowed) {
      throw new ApiError(
        'rate-limited',
        `You have used today's ${limit} application runs. The limit resets at midnight UTC.`,
      );
    }
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
}

function publicTimed(r: WebTimedSessionRecord): WebTimedSession {
  return {
    id: r.id,
    challengeId: r.challengeId,
    framework: r.framework,
    durationMinutes: r.durationMinutes,
    startedAt: r.startedAt,
    deadline: r.deadline,
    status: r.status,
    submissions: r.submissions,
    ...(r.finishedAt ? { finishedAt: r.finishedAt } : {}),
    ...(r.best ? { best: r.best } : {}),
  };
}

function unavailable(): ApiError {
  return new ApiError(
    'unavailable',
    'Running web applications is not available on this server yet. You can read the challenge and edit the project.',
  );
}

/** A stored run as its owner sees it (never the files or the owner id). */
function publicRun(r: WebRunRecord): WebRun {
  return {
    id: r.id,
    challengeId: r.challengeId,
    framework: r.framework,
    mode: r.mode,
    status: r.status,
    acceptedAt: r.acceptedAt,
    ...(r.result ? { result: r.result } : {}),
    ...(r.progress ? { progress: r.progress } : {}),
    ...(r.timedSessionId ? { timedSessionId: r.timedSessionId } : {}),
  };
}
