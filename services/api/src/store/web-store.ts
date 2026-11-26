import type {
  WebChallengeProgress,
  WebDraft,
  WebHttpRequest,
  WebRun,
  WebSubmissionSummary,
  WebTimedSession,
} from '@pracstack/api-contracts';

/*
 * Persistence for Web Development Challenges. Every record is owned by one
 * user and every method takes the owner's id, so one user can never read or
 * change another's submissions, drafts, quotas or timed sessions.
 */

/** A graded submission, including the submitted editable files. */
export interface WebSubmissionRecord extends WebSubmissionSummary {
  readonly userId: string;
  readonly files: Readonly<Record<string, string>>;
}

export interface WebProgressRecord extends WebChallengeProgress {
  readonly userId: string;
}

export interface WebDraftRecord extends WebDraft {
  readonly userId: string;
}

export interface WebTimedSessionRecord extends WebTimedSession {
  readonly userId: string;
  /** Incremented on every write; used for optimistic concurrency. */
  readonly revision: number;
}

/**
 * A run (visible tests or a graded submission) from acceptance to result. The
 * API creates it (`queued`); the web worker claims it, runs it and completes
 * it. Kept for a day, so the browser can poll it from any API instance.
 */
export interface WebRunRecord extends WebRun {
  readonly userId: string;
  /** The submitted editable files (validated by the API). */
  readonly files: Readonly<Record<string, string>>;
  /** HTTP-client runs: the requests to send (validated by the API). */
  readonly requests?: readonly WebHttpRequest[];
  /** Milliseconds since the epoch after which the record may be deleted. */
  readonly expiresAt: number;
}

export interface WebStore {
  createWebRun(run: WebRunRecord): Promise<void>;
  getWebRun(userId: string, id: string): Promise<WebRunRecord | undefined>;
  /**
   * Writes `run` if the stored run's status is still `expectedStatus`; false
   * otherwise (another worker claimed it, or it is already completed).
   */
  updateWebRun(run: WebRunRecord, expectedStatus: WebRun['status']): Promise<boolean>;

  /**
   * Takes one of `limit` slots of the lease `name` for `holder` until
   * `untilMs` (holders past their time no longer count). Atomic: concurrent
   * callers never exceed the limit. True if taken (or already held).
   */
  acquireWebLease(
    name: string,
    holder: string,
    limit: number,
    nowMs: number,
    untilMs: number,
  ): Promise<boolean>;
  releaseWebLease(name: string, holder: string): Promise<void>;

  /**
   * Stores a graded submission and updates progress: attempts +1, the
   * framework is attempted, and (if accepted) solved for that framework.
   * "Solved" is sticky. Returns the new progress.
   */
  recordWebSubmission(submission: WebSubmissionRecord): Promise<WebProgressRecord>;
  /** Most recent first. */
  listWebSubmissions(
    userId: string,
    challengeId: string,
    limit: number,
  ): Promise<readonly WebSubmissionRecord[]>;
  listWebProgress(userId: string): Promise<readonly WebProgressRecord[]>;

  getWebDraft(
    userId: string,
    challengeId: string,
    framework: string,
  ): Promise<WebDraftRecord | undefined>;
  putWebDraft(draft: WebDraftRecord): Promise<void>;
  deleteWebDraft(userId: string, challengeId: string, framework: string): Promise<void>;

  /**
   * Counts one execution for the user on `day` (UTC date), unless that would
   * exceed `limit`. Atomic: concurrent requests cannot exceed the quota.
   */
  consumeWebExecution(
    userId: string,
    day: string,
    limit: number,
  ): Promise<{ readonly allowed: boolean; readonly used: number }>;
  getWebExecutions(userId: string, day: string): Promise<number>;

  /** Creates a timed session (revision 1). */
  createWebTimedSession(session: WebTimedSessionRecord): Promise<void>;
  getWebTimedSession(userId: string, id: string): Promise<WebTimedSessionRecord | undefined>;
  /** Writes `session` if the stored revision is still `expectedRevision`; false on conflict. */
  updateWebTimedSession(session: WebTimedSessionRecord, expectedRevision: number): Promise<boolean>;
  /** Most recent first. */
  listWebTimedSessions(userId: string): Promise<readonly WebTimedSessionRecord[]>;
}

/** The progress fields after one more submission. */
export function nextWebProgress(
  previous: WebProgressRecord | undefined,
  submission: WebSubmissionRecord,
): WebProgressRecord {
  const accepted = submission.verdict === 'accepted';
  const solvedFrameworks = new Set(previous?.frameworksSolved ?? []);
  const attempted = new Set(previous?.frameworksAttempted ?? []);
  attempted.add(submission.framework);
  if (accepted) solvedFrameworks.add(submission.framework);
  const solvedAt = previous?.solvedAt ?? (accepted ? submission.submittedAt : undefined);
  return {
    userId: submission.userId,
    challengeId: submission.challengeId,
    attempts: (previous?.attempts ?? 0) + 1,
    solved: (previous?.solved ?? false) || accepted,
    frameworksSolved: [...solvedFrameworks].sort(),
    frameworksAttempted: [...attempted].sort(),
    lastSubmittedAt: submission.submittedAt,
    ...(solvedAt ? { solvedAt } : {}),
  };
}

/** Lease holders still within their time. */
export function liveHolders(
  holders: Readonly<Record<string, number>> | undefined,
  nowMs: number,
): Record<string, number> {
  return Object.fromEntries(Object.entries(holders ?? {}).filter(([, until]) => until > nowMs));
}

/** Serializable snapshot (part of the local store file). */
export interface WebData {
  runs: Record<string, WebRunRecord>;
  leases: Record<string, Record<string, number>>;
  submissions: Record<string, WebSubmissionRecord>;
  progress: Record<string, WebProgressRecord>;
  drafts: Record<string, WebDraftRecord>;
  usage: Record<string, number>;
  timed: Record<string, WebTimedSessionRecord>;
}

export const emptyWebData = (): WebData => ({
  runs: {},
  leases: {},
  submissions: {},
  progress: {},
  drafts: {},
  usage: {},
  timed: {},
});

/** In-memory web store; each method's checks and writes happen in one JavaScript turn. */
export class InMemoryWebStore implements WebStore {
  constructor(
    private readonly data: () => WebData,
    private readonly persist: () => Promise<void>,
  ) {}

  async createWebRun(run: WebRunRecord): Promise<void> {
    const d = this.data();
    // The API's clock (the new run's acceptance), not this machine's: they can differ in tests.
    const now = Date.parse(run.acceptedAt);
    for (const [key, old] of Object.entries(d.runs)) if (old.expiresAt < now) delete d.runs[key];
    d.runs[`${run.userId}#${run.id}`] = run;
    await this.persist();
  }

  getWebRun(userId: string, id: string): Promise<WebRunRecord | undefined> {
    return Promise.resolve(this.data().runs[`${userId}#${id}`]);
  }

  async updateWebRun(run: WebRunRecord, expectedStatus: WebRun['status']): Promise<boolean> {
    const key = `${run.userId}#${run.id}`;
    const current = this.data().runs[key];
    if (!current || current.status !== expectedStatus) return false;
    this.data().runs[key] = run;
    await this.persist();
    return true;
  }

  async acquireWebLease(
    name: string,
    holder: string,
    limit: number,
    nowMs: number,
    untilMs: number,
  ): Promise<boolean> {
    const d = this.data();
    const holders = liveHolders(d.leases[name], nowMs);
    if (!(holder in holders) && Object.keys(holders).length >= limit) {
      d.leases[name] = holders;
      return false;
    }
    d.leases[name] = { ...holders, [holder]: untilMs };
    await this.persist();
    return true;
  }

  async releaseWebLease(name: string, holder: string): Promise<void> {
    const holders = { ...this.data().leases[name] };
    delete holders[holder];
    this.data().leases[name] = holders;
    await this.persist();
  }

  async recordWebSubmission(submission: WebSubmissionRecord): Promise<WebProgressRecord> {
    const d = this.data();
    d.submissions[`${submission.userId}#${submission.id}`] = submission;
    const key = `${submission.userId}#${submission.challengeId}`;
    const progress = nextWebProgress(d.progress[key], submission);
    d.progress[key] = progress;
    await this.persist();
    return progress;
  }

  listWebSubmissions(
    userId: string,
    challengeId: string,
    limit: number,
  ): Promise<readonly WebSubmissionRecord[]> {
    return Promise.resolve(
      Object.values(this.data().submissions)
        .filter((s) => s.userId === userId && s.challengeId === challengeId)
        .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt) || b.id.localeCompare(a.id))
        .slice(0, limit),
    );
  }

  listWebProgress(userId: string): Promise<readonly WebProgressRecord[]> {
    return Promise.resolve(Object.values(this.data().progress).filter((p) => p.userId === userId));
  }

  getWebDraft(userId: string, challengeId: string, framework: string) {
    return Promise.resolve(this.data().drafts[`${userId}#${challengeId}#${framework}`]);
  }

  async putWebDraft(draft: WebDraftRecord): Promise<void> {
    this.data().drafts[`${draft.userId}#${draft.challengeId}#${draft.framework}`] = draft;
    await this.persist();
  }

  async deleteWebDraft(userId: string, challengeId: string, framework: string): Promise<void> {
    delete this.data().drafts[`${userId}#${challengeId}#${framework}`];
    await this.persist();
  }

  async consumeWebExecution(userId: string, day: string, limit: number) {
    const d = this.data();
    const key = `${userId}#${day}`;
    const used = d.usage[key] ?? 0;
    if (used >= limit) return { allowed: false, used };
    d.usage[key] = used + 1;
    await this.persist();
    return { allowed: true, used: used + 1 };
  }

  getWebExecutions(userId: string, day: string): Promise<number> {
    return Promise.resolve(this.data().usage[`${userId}#${day}`] ?? 0);
  }

  async createWebTimedSession(session: WebTimedSessionRecord): Promise<void> {
    this.data().timed[`${session.userId}#${session.id}`] = session;
    await this.persist();
  }

  getWebTimedSession(userId: string, id: string) {
    return Promise.resolve(this.data().timed[`${userId}#${id}`]);
  }

  async updateWebTimedSession(session: WebTimedSessionRecord, expectedRevision: number) {
    const key = `${session.userId}#${session.id}`;
    const current = this.data().timed[key];
    if (!current || current.revision !== expectedRevision) return false;
    this.data().timed[key] = { ...session, revision: expectedRevision + 1 };
    await this.persist();
    return true;
  }

  listWebTimedSessions(userId: string): Promise<readonly WebTimedSessionRecord[]> {
    return Promise.resolve(
      Object.values(this.data().timed)
        .filter((s) => s.userId === userId)
        .sort((a, b) => b.startedAt.localeCompare(a.startedAt)),
    );
  }
}
