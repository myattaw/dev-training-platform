import { inject, Injectable, signal } from '@angular/core';
import type {
  AnswerPayload,
  ScenarioAnswerResponse,
  ScenarioProgress,
  ScenarioProgressListResponse,
} from '@pracstack/api-contracts';
import type { Scenario, ScenarioSummary } from '@pracstack/content-model';
import { ApiClient } from '../../../core/api/api-client';
import { AuthService } from '../../../core/auth/auth.service';
import { ContentRepository } from '../../../core/content/content-repository';

/**
 * Enterprise Scenarios: public scenario content (from the content files) and
 * the learner's progress and answers (from the API).
 */
@Injectable({ providedIn: 'root' })
export class ScenarioService {
  private readonly repository = inject(ContentRepository);
  private readonly api = inject(ApiClient);
  private readonly progressState = signal<ReadonlyMap<string, ScenarioProgress> | undefined>(
    undefined,
  );
  /** Started scenarios by id, once {@link loadProgress} has run (undefined before). */
  readonly progressById = this.progressState.asReadonly();

  /** Loads (or reloads) the learner's scenario progress into {@link progressById}. */
  async loadProgress(): Promise<void> {
    const res = await this.progressList();
    this.progressState.set(new Map(res.scenarios.map((p) => [p.scenarioId, p])));
  }

  async catalog(): Promise<readonly ScenarioSummary[]> {
    return (await this.repository.scenarios()).scenarios;
  }

  /** The full scenario, or undefined if there is none with this id. */
  async scenario(id: string): Promise<Scenario | undefined> {
    const summary = (await this.catalog()).find((s) => s.id === id);
    return summary ? this.repository.scenario(summary.id, summary.version) : undefined;
  }

  progressList(): Promise<ScenarioProgressListResponse> {
    return this.api.get<ScenarioProgressListResponse>('/scenarios/progress');
  }

  progress(id: string): Promise<ScenarioProgress> {
    return this.api.get<ScenarioProgress>(`/scenarios/${encodeURIComponent(id)}/progress`);
  }

  answer(id: string, taskId: string, answer: AnswerPayload): Promise<ScenarioAnswerResponse> {
    return this.api.post<ScenarioAnswerResponse>(`/scenarios/${encodeURIComponent(id)}/answer`, {
      taskId,
      answer,
    });
  }
}

/**
 * The learner's scenario progress as a signal, loading it once if the API can
 * be used (signed in, or local mode). Call in an injection context.
 */
export function scenarioProgressSignal(): () => ReadonlyMap<string, ScenarioProgress> | undefined {
  const service = inject(ScenarioService);
  if (inject(AuthService).canUseApi()) {
    // A failure leaves scenarios "unknown" on roles pages; the rest still works.
    service.loadProgress().catch(() => undefined);
  }
  return service.progressById;
}
