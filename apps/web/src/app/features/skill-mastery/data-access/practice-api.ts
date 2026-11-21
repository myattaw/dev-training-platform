import { inject, Injectable, signal } from '@angular/core';
import type {
  AnswerRequest,
  AnswerResponse,
  HintResponse,
  HistoryResponse,
  NextQuestionResponse,
  ProgressResponse,
  RunSqlResponse,
} from '@pracstack/api-contracts';
import { ApiClient } from '../../../core/api/api-client';
import { SessionService } from '../../../core/session/session.service';

/**
 * Typed access to the Skill Mastery API. All scoring happens on the server;
 * this service only sends answers and displays what comes back.
 */
@Injectable({ providedIn: 'root' })
export class PracticeApi {
  private readonly api = inject(ApiClient);
  private readonly session = inject(SessionService);

  /** Bumped after every answer, so progress views can refresh. */
  readonly progressVersion = signal(0);

  progress(technologyId: string): Promise<ProgressResponse> {
    return this.api.get('/skill-mastery/progress', { technologyId });
  }

  history(skillId: string): Promise<HistoryResponse> {
    return this.api.get(`/skill-mastery/skills/${encodeURIComponent(skillId)}/history`);
  }

  next(skillId: string): Promise<NextQuestionResponse> {
    return this.api.post('/skill-mastery/practice/next', { skillId });
  }

  /** Runs a query on the sample data of the current SQL question. Not graded. */
  runSql(token: string, query: string): Promise<RunSqlResponse> {
    return this.api.post('/skill-mastery/practice/run-sql', { token, query });
  }

  hint(token: string): Promise<HintResponse> {
    return this.api.post('/skill-mastery/practice/hint', { token });
  }

  async answer(request: AnswerRequest): Promise<AnswerResponse> {
    const response = await this.api.post<AnswerResponse>('/skill-mastery/practice/answer', request);
    this.progressVersion.update((n) => n + 1);
    this.session.refresh();
    return response;
  }
}
