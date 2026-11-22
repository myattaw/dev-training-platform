import { inject, Injectable, signal } from '@angular/core';
import type {
  ChallengeCodeRequest,
  CompanyDetailResponse,
  CompanyListResponse,
  CreateInterviewSessionRequest,
  InterviewSessionListResponse,
  InterviewSessionResponse,
  InterviewSubmitResponse,
  RecommendationsResponse,
  ReportedQuestionStatus,
  SavedCompaniesResponse,
} from '@pracstack/api-contracts';
import { ApiClient } from '../../../core/api/api-client';

export interface CompanySearch {
  readonly q?: string;
  readonly letter?: string;
  readonly page?: number;
}

const seg = encodeURIComponent;

/**
 * Typed access to Company Interview Prep and timed sessions. Everything is
 * decided on the server (plans, deadlines, grading); this only displays it.
 */
@Injectable({ providedIn: 'root' })
export class CompaniesApi {
  private readonly api = inject(ApiClient);

  /** Bumped after changes, so lists and dashboards can refresh. */
  readonly version = signal(0);

  list(search: CompanySearch): Promise<CompanyListResponse> {
    const query: Record<string, string> = {};
    if (search.q) query['q'] = search.q;
    if (search.letter) query['letter'] = search.letter;
    if (search.page && search.page > 1) query['page'] = String(search.page);
    return this.api.get('/companies', query);
  }

  detail(slug: string): Promise<CompanyDetailResponse> {
    return this.api.get(`/companies/${seg(slug)}`);
  }

  recommendations(slug: string): Promise<RecommendationsResponse> {
    return this.api.get(`/companies/${seg(slug)}/recommendations`);
  }

  saved(): Promise<SavedCompaniesResponse> {
    return this.api.get('/me/companies');
  }

  async setSaved(slug: string, saved: boolean): Promise<boolean> {
    const path = `/me/companies/${seg(slug)}/save`;
    const result = await (saved
      ? this.api.post<{ saved: boolean }>(path, {})
      : this.api.delete<{ saved: boolean }>(path));
    this.version.update((n) => n + 1);
    return result.saved;
  }

  async setQuestionStatus(
    slug: string,
    questionId: string,
    status: ReportedQuestionStatus,
  ): Promise<ReportedQuestionStatus> {
    const result = await this.api.put<{ status: ReportedQuestionStatus }>(
      `/me/companies/${seg(slug)}/questions/${seg(questionId)}`,
      { status },
    );
    this.version.update((n) => n + 1);
    return result.status;
  }

  /* ---- timed sessions ---- */

  createSession(request: CreateInterviewSessionRequest): Promise<InterviewSessionResponse> {
    return this.api.post('/interview-sessions', request);
  }

  session(id: string): Promise<InterviewSessionResponse> {
    return this.api.get(`/interview-sessions/${seg(id)}`);
  }

  sessions(companySlug?: string): Promise<InterviewSessionListResponse> {
    return this.api.get('/interview-sessions', companySlug ? { companySlug } : {});
  }

  submit(id: string, request: ChallengeCodeRequest): Promise<InterviewSubmitResponse> {
    return this.api.post(`/interview-sessions/${seg(id)}/submit`, request);
  }

  async finish(id: string, outcome: 'completed' | 'abandoned'): Promise<InterviewSessionResponse> {
    const response = await this.api.post<InterviewSessionResponse>(
      `/interview-sessions/${seg(id)}/finish`,
      { outcome },
    );
    this.version.update((n) => n + 1);
    return response;
  }
}
