import { Injectable, inject, signal } from '@angular/core';
import type {
  CreateWebRunRequest,
  WebChallengeProgress,
  WebChallengeResponse,
  WebDraftResponse,
  WebHttpRequest,
  WebProgressResponse,
  WebProjectResponse,
  WebRunResponse,
  WebSubmissionsResponse,
  WebTimedDuration,
  WebTimedSessionResponse,
  WebUsageResponse,
} from '@pracstack/api-contracts';
import type { WebChallengeSummary, WebFramework } from '@pracstack/content-model';
import { ApiClient } from '../../../core/api/api-client';
import { readJson, removeKey, writeJson } from '../../../core/browser/browser-storage';
import { ContentRepository } from '../../../core/content/content-repository';

/**
 * Web Development Challenges: catalog (public manifest), details, starter
 * projects, runs (tests, submissions, HTTP-client requests), drafts and timed
 * sessions (API).
 * Everything that is graded or access-controlled comes from the API.
 */
@Injectable({ providedIn: 'root' })
export class WebChallengesService {
  private readonly api = inject(ApiClient);
  private readonly content = inject(ContentRepository);

  /** Per-challenge progress of the signed-in user (refreshed after submissions). */
  readonly progress = signal<ReadonlyMap<string, WebChallengeProgress>>(new Map());

  async summaries(): Promise<readonly WebChallengeSummary[]> {
    return (await this.content.manifest()).webChallenges ?? [];
  }

  async summary(id: string): Promise<WebChallengeSummary | undefined> {
    return (await this.summaries()).find((s) => s.id === id);
  }

  async loadProgress(): Promise<void> {
    const res = await this.api.get<WebProgressResponse>('/web-challenges/progress');
    this.progress.set(new Map(res.challenges.map((p) => [p.challengeId, p])));
  }

  recordProgress(progress: WebChallengeProgress): void {
    this.progress.update((map) => new Map(map).set(progress.challengeId, progress));
  }

  detail(id: string): Promise<WebChallengeResponse> {
    return this.api.get(`/web-challenges/${encodeURIComponent(id)}`);
  }

  project(id: string, framework: WebFramework): Promise<WebProjectResponse> {
    return this.api.get(
      `/web-challenges/${encodeURIComponent(id)}/frameworks/${framework}/project`,
    );
  }

  history(id: string): Promise<WebSubmissionsResponse> {
    return this.api.get(`/web-challenges/${encodeURIComponent(id)}/submissions`);
  }

  usage(): Promise<WebUsageResponse> {
    return this.api.get('/me/web-usage');
  }

  createRun(id: string, request: CreateWebRunRequest): Promise<WebRunResponse> {
    return this.api.post(`/web-challenges/${encodeURIComponent(id)}/runs`, request);
  }

  getRun(runId: string): Promise<WebRunResponse> {
    return this.api.get(`/web-runs/${runId}`);
  }

  accountDraft(id: string, framework: WebFramework): Promise<WebDraftResponse> {
    return this.api.get(`/me/web-drafts/${encodeURIComponent(id)}/${framework}`);
  }

  saveAccountDraft(
    id: string,
    framework: WebFramework,
    challengeVersion: number,
    files: Readonly<Record<string, string>>,
  ): Promise<WebDraftResponse> {
    return this.api.put(`/me/web-drafts/${encodeURIComponent(id)}/${framework}`, {
      challengeVersion,
      files,
    });
  }

  deleteAccountDraft(id: string, framework: WebFramework): Promise<WebDraftResponse> {
    return this.api.delete(`/me/web-drafts/${encodeURIComponent(id)}/${framework}`);
  }

  startTimed(
    challengeId: string,
    framework: WebFramework,
    durationMinutes: WebTimedDuration,
  ): Promise<WebTimedSessionResponse> {
    return this.api.post('/web-timed-sessions', { challengeId, framework, durationMinutes });
  }

  getTimed(id: string): Promise<WebTimedSessionResponse> {
    return this.api.get(`/web-timed-sessions/${id}`);
  }

  finishTimed(id: string): Promise<WebTimedSessionResponse> {
    return this.api.post(`/web-timed-sessions/${id}/finish`, {});
  }
}

/** The HTTP client's request list, kept in this browser per challenge and framework. */
const requestsKey = (id: string, framework: WebFramework) => `web-requests:${id}:${framework}`;

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
const isRequestList = (v: unknown): v is WebHttpRequest[] =>
  Array.isArray(v) &&
  v.length <= 20 &&
  v.every(
    (r) =>
      typeof r === 'object' &&
      r !== null &&
      METHODS.includes((r as WebHttpRequest).method) &&
      typeof (r as WebHttpRequest).path === 'string',
  );

export function readLocalRequests(
  id: string,
  framework: WebFramework,
): WebHttpRequest[] | undefined {
  return readJson(requestsKey(id, framework), isRequestList);
}

export function writeLocalRequests(
  id: string,
  framework: WebFramework,
  requests: readonly WebHttpRequest[],
): void {
  writeJson(requestsKey(id, framework), requests);
}

/** A draft kept in this browser: per challenge, framework and challenge version. */
export interface LocalWebDraft {
  readonly challengeVersion: number;
  readonly files: Readonly<Record<string, string>>;
  readonly updatedAt: string;
}

const draftKey = (id: string, framework: WebFramework) => `web-draft:${id}:${framework}`;

const isDraft = (v: unknown): v is LocalWebDraft =>
  typeof v === 'object' &&
  v !== null &&
  typeof (v as LocalWebDraft).challengeVersion === 'number' &&
  typeof (v as LocalWebDraft).files === 'object' &&
  (v as LocalWebDraft).files !== null &&
  Object.values((v as LocalWebDraft).files).every((c) => typeof c === 'string');

export function readLocalDraft(id: string, framework: WebFramework): LocalWebDraft | undefined {
  return readJson(draftKey(id, framework), isDraft);
}

export function writeLocalDraft(id: string, framework: WebFramework, draft: LocalWebDraft): void {
  writeJson(draftKey(id, framework), draft);
}

export function removeLocalDraft(id: string, framework: WebFramework): void {
  removeKey(draftKey(id, framework));
}
