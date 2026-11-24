import { inject, Injectable, signal } from '@angular/core';
import type {
  CreatePlanRequest,
  DeletePlanResponse,
  PreparationResponse,
  SavedPlan,
} from '@pracstack/api-contracts';
import { ApiClient } from '../../../core/api/api-client';
import { AuthService } from '../../../core/auth/auth.service';

const NOTHING_SAVED: PreparationResponse = { targetRoleId: null, plans: [] };

/**
 * The learner's target role and saved plans. Plans carry taxonomy term ids
 * only: job postings are analyzed in the browser and are never sent.
 */
@Injectable({ providedIn: 'root' })
export class PreparationApi {
  private readonly api = inject(ApiClient);
  private readonly auth = inject(AuthService);

  /** Bumped after every change, so pages can reload. */
  readonly version = signal(0);

  /** Signed out: nothing saved (the catalog and paths still show). */
  get(): Promise<PreparationResponse> {
    if (!this.auth.canUseApi()) return Promise.resolve(NOTHING_SAVED);
    return this.api.get('/me/preparation');
  }

  async setTargetRole(roleId: string | null): Promise<PreparationResponse> {
    const response = await this.api.put<PreparationResponse>('/me/preparation/target-role', {
      roleId,
    });
    this.version.update((n) => n + 1);
    return response;
  }

  async createPlan(request: CreatePlanRequest): Promise<SavedPlan> {
    // Exactly these two fields: the API refuses anything else.
    const plan = await this.api.post<SavedPlan>('/me/preparation/plans', {
      title: request.title,
      termIds: request.termIds,
    });
    this.version.update((n) => n + 1);
    return plan;
  }

  async deletePlan(id: string): Promise<DeletePlanResponse> {
    const response = await this.api.delete<DeletePlanResponse>(
      `/me/preparation/plans/${encodeURIComponent(id)}`,
    );
    this.version.update((n) => n + 1);
    return response;
  }
}
