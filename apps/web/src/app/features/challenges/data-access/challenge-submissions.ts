import { effect, inject, Injectable, signal } from '@angular/core';
import type {
  ChallengeCodeRequest,
  ChallengeProgress,
  ChallengeProgressResponse,
  ChallengeRunResponse,
  SubmissionListResponse,
  SubmissionResponse,
} from '@pracstack/api-contracts';
import { ApiClient } from '../../../core/api/api-client';
import { AuthService } from '../../../core/auth/auth.service';
import type { RunOutcome } from '../runner/runner.models';

/**
 * Server-side runs and submissions. Submissions are graded on the server with
 * hidden tests, in an isolated container; "solved" comes only from here.
 */
@Injectable({ providedIn: 'root' })
export class ChallengeSubmissions {
  private readonly api = inject(ApiClient);
  private readonly auth = inject(AuthService);
  private readonly progressState = signal<ReadonlyMap<string, ChallengeProgress>>(new Map());

  /** Server progress per challenge id (empty when the API is unavailable). */
  readonly progress = this.progressState.asReadonly();

  constructor() {
    effect(() => {
      if (this.auth.canUseApi()) this.refreshProgress();
      else this.progressState.set(new Map());
    });
  }

  refreshProgress(): void {
    if (!this.auth.canUseApi()) return;
    this.api.get<ChallengeProgressResponse>('/challenges/progress').then(
      (res) => this.progressState.set(new Map(res.challenges.map((c) => [c.challengeId, c]))),
      () => undefined,
    );
  }

  /** Visible tests on the server (used for Java and C#, which cannot run in the browser). */
  async run(challengeId: string, request: ChallengeCodeRequest): Promise<RunOutcome> {
    const res = await this.api.post<ChallengeRunResponse>(
      `/challenges/${encodeURIComponent(challengeId)}/run`,
      request,
    );
    return toRunOutcome(res);
  }

  async submit(challengeId: string, request: ChallengeCodeRequest): Promise<SubmissionResponse> {
    const res = await this.api.post<SubmissionResponse>(
      `/challenges/${encodeURIComponent(challengeId)}/submissions`,
      request,
    );
    this.refreshProgress();
    return res;
  }

  history(challengeId: string): Promise<SubmissionListResponse> {
    if (!this.auth.canUseApi()) return Promise.resolve({ submissions: [] });
    return this.api.get(`/challenges/${encodeURIComponent(challengeId)}/submissions`);
  }
}

/** Shows a server run in the same results panel as a browser run. */
export function toRunOutcome(res: ChallengeRunResponse): RunOutcome {
  const d = res.detail;
  switch (d.status) {
    case 'passed':
    case 'failed':
      return { status: d.status, results: d.results, logs: res.logs, durationMs: res.durationMs };
    case 'compile-error':
      return { status: 'compile-error', diagnostics: d.diagnostics };
    case 'runtime-error':
      return { status: 'load-error', message: d.message, logs: res.logs };
    case 'timeout':
      return { status: 'timeout', timeoutMs: d.timeoutMs };
    case 'resource-limit':
      return { status: 'resource-limit', message: d.message };
  }
}
