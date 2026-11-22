import type {
  ChallengeCodeRequest,
  CreateInterviewSessionRequest,
  InterviewResult,
  InterviewSession,
  InterviewSessionListResponse,
  InterviewSessionResponse,
  InterviewSubmitResponse,
  SubmissionStatus,
} from '@pracstack/api-contracts';
import type { Caller } from '../auth';
import type { ChallengeService } from '../challenges/challenge-service';
import type { ContentSource } from '../content/content-source';
import { ApiError, badRequest, notFound } from '../http';
import type { AccountStore, InterviewSessionRecord } from '../store/account-store';

/*
 * Timed interview practice, with the clock on the server.
 *
 * - The start time and deadline are set by the server when the session is
 *   created and never change. No request can move them; retrying a create
 *   with the same client request id returns the same session.
 * - Only one unfinished session per challenge and company: starting again
 *   while one runs returns 409 (resume it instead), so the clock cannot be
 *   reset by starting over.
 * - Submissions are graded by the normal challenge grader and accepted only
 *   while the deadline has not passed (checked when the request arrives).
 * - Elapsed time is computed here from server timestamps; the browser's
 *   timer is a display of the server deadline.
 * - Session updates use optimistic concurrency, so concurrent submissions
 *   cannot lose each other's results.
 */

const LIST_LIMIT = 20;
const MAX_RETRIES = 3;

export interface InterviewServiceDeps {
  readonly content: ContentSource;
  readonly accounts: AccountStore;
  readonly challenges: ChallengeService;
  readonly now: () => Date;
  readonly newId: () => string;
}

const STATUS_RANK: Readonly<Record<SubmissionStatus, number>> = {
  accepted: 5,
  failed: 4,
  'runtime-error': 3,
  timeout: 2,
  'resource-limit': 1,
  'compile-error': 0,
};

/** Higher is better: accepted first, then more tests passed. */
function better(a: InterviewResult | undefined, b: InterviewResult): InterviewResult {
  if (!a) return b;
  const score = (r: InterviewResult) => [
    r.status === 'accepted' ? 1 : 0,
    r.visiblePassed + r.hiddenPassed,
    STATUS_RANK[r.status],
  ];
  const [x, y] = [score(a), score(b)];
  for (let i = 0; i < x.length; i++) {
    if ((y[i] ?? 0) !== (x[i] ?? 0)) return (y[i] ?? 0) > (x[i] ?? 0) ? b : a;
  }
  return a;
}

export class InterviewService {
  constructor(private readonly deps: InterviewServiceDeps) {}

  async create(
    caller: Caller,
    request: CreateInterviewSessionRequest,
  ): Promise<InterviewSessionResponse> {
    const company = this.deps.content.findCompany(request.companySlug);
    if (!company) throw notFound('There is no company with this name in PracStack.');
    const challenge = this.deps.content.findChallenge(request.challengeId)?.challenge;
    if (!challenge) {
      if (this.deps.content.findPlannedChallenge(request.challengeId)) {
        throw new ApiError(
          'conflict',
          'This challenge is coming soon and cannot be practised yet.',
        );
      }
      throw notFound('There is no challenge with this id.');
    }
    if (!challenge.languages[request.language]) {
      throw badRequest('This challenge cannot be solved in that language.');
    }

    const now = this.deps.now();
    const open = (await this.deps.accounts.listInterviewSessions(caller.id, 200)).find(
      (s) =>
        s.clientRequestId !== request.clientRequestId &&
        s.companyId === company.company.id &&
        s.challengeId === challenge.id &&
        this.effectiveStatus(s, now) === 'active',
    );
    if (open) {
      throw new ApiError(
        'conflict',
        `You already have a timed session for this challenge in progress (${open.id}). Resume or finish it first.`,
      );
    }

    const record: InterviewSessionRecord = {
      id: this.deps.newId(),
      userId: caller.id,
      clientRequestId: request.clientRequestId,
      companyId: company.company.id,
      challengeId: challenge.id,
      language: request.language,
      durationMinutes: request.durationMinutes,
      startedAt: now.toISOString(),
      deadline: new Date(now.getTime() + request.durationMinutes * 60_000).toISOString(),
      status: 'active',
      submissions: 0,
      revision: 1,
    };
    const outcome = await this.deps.accounts.createInterviewSession(record);
    return this.respond(outcome.kind === 'existing' ? outcome.session : record);
  }

  async get(caller: Caller, id: string): Promise<InterviewSessionResponse> {
    return this.respond(await this.load(caller, id));
  }

  async list(caller: Caller, companySlug?: string): Promise<InterviewSessionListResponse> {
    const sessions = await this.deps.accounts.listInterviewSessions(caller.id, 200);
    return {
      sessions: sessions
        .filter((s) => companySlug === undefined || s.companyId === companySlug)
        .slice(0, LIST_LIMIT)
        .map((s) => this.view(s)),
    };
  }

  async submit(
    caller: Caller,
    id: string,
    request: ChallengeCodeRequest,
  ): Promise<InterviewSubmitResponse> {
    const session = await this.load(caller, id);
    this.assertActive(session);
    if (request.language !== session.language) {
      throw badRequest(`This session is in ${session.language}.`);
    }
    // Graded by the normal challenge grader; also recorded as a normal submission.
    const submission = await this.deps.challenges.submit(caller, session.challengeId, request);
    const s = submission.submission;
    const result: InterviewResult = {
      status: s.status,
      visiblePassed: s.visiblePassed,
      visibleTotal: s.visibleTotal,
      hiddenPassed: s.hiddenPassed,
      hiddenTotal: s.hiddenTotal,
    };
    const updated = await this.update(caller, id, (current) => ({
      ...current,
      submissions: current.submissions + 1,
      best: better(current.best, result),
    }));
    return { ...this.respond(updated), submission };
  }

  async finish(
    caller: Caller,
    id: string,
    outcome: 'completed' | 'abandoned',
  ): Promise<InterviewSessionResponse> {
    const now = this.deps.now();
    const updated = await this.update(caller, id, (current) => {
      if (current.status !== 'active') return undefined; // Already finished: idempotent.
      const expired = now.getTime() >= Date.parse(current.deadline);
      return {
        ...current,
        status: expired ? 'expired' : outcome,
        finishedAt: expired ? current.deadline : now.toISOString(),
      };
    });
    return this.respond(updated);
  }

  // ---- helpers ----

  private async load(caller: Caller, id: string): Promise<InterviewSessionRecord> {
    const session = await this.deps.accounts.getInterviewSession(caller.id, id);
    // Someone else's session is reported as missing, so ids cannot be probed.
    if (!session) throw notFound('There is no such interview session.');
    return session;
  }

  private assertActive(session: InterviewSessionRecord): void {
    const status = this.effectiveStatus(session, this.deps.now());
    if (status === 'expired') {
      throw new ApiError('session-expired', 'Time is up: this session has ended.');
    }
    if (status !== 'active') throw new ApiError('conflict', 'This session has already finished.');
  }

  /** Applies `change` with optimistic concurrency; `undefined` from `change` means no write. */
  private async update(
    caller: Caller,
    id: string,
    change: (current: InterviewSessionRecord) => InterviewSessionRecord | undefined,
  ): Promise<InterviewSessionRecord> {
    for (let i = 0; i < MAX_RETRIES; i++) {
      const current = await this.load(caller, id);
      const next = change(current);
      if (!next) return current;
      const write = { ...next, revision: current.revision + 1 };
      if (await this.deps.accounts.updateInterviewSession(write)) return write;
    }
    throw new ApiError('conflict', 'The session changed meanwhile. Try again.');
  }

  private effectiveStatus(session: InterviewSessionRecord, now: Date): InterviewSession['status'] {
    if (session.status === 'active' && now.getTime() >= Date.parse(session.deadline)) {
      return 'expired';
    }
    return session.status;
  }

  private view(session: InterviewSessionRecord): InterviewSession {
    const now = this.deps.now();
    const status = this.effectiveStatus(session, now);
    const finishedAt = session.finishedAt ?? (status === 'expired' ? session.deadline : undefined);
    const company = this.deps.content.findCompany(session.companyId);
    const challenge = this.deps.content.findChallenge(session.challengeId)?.challenge;
    return {
      id: session.id,
      companySlug: session.companyId,
      companyName: company?.company.displayName ?? session.companyId,
      challengeId: session.challengeId,
      challengeTitle: challenge?.title ?? session.challengeId,
      difficulty: challenge?.difficulty ?? 'medium',
      language: session.language,
      durationMinutes: session.durationMinutes,
      startedAt: session.startedAt,
      deadline: session.deadline,
      ...(finishedAt ? { finishedAt } : {}),
      status,
      ...(finishedAt
        ? {
            timeUsedSeconds: Math.max(
              0,
              Math.round((Date.parse(finishedAt) - Date.parse(session.startedAt)) / 1000),
            ),
          }
        : {}),
      submissions: session.submissions,
      ...(session.best ? { best: session.best } : {}),
    };
  }

  private respond(session: InterviewSessionRecord): InterviewSessionResponse {
    return { session: this.view(session), serverTime: this.deps.now().toISOString() };
  }
}
