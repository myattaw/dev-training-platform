import {
  type CreatePlanRequest,
  type DeletePlanResponse,
  PREPARATION_LIMITS,
  type PreparationResponse,
  type SavedPlan,
} from '@pracstack/api-contracts';
import type { Caller } from '../auth';
import type { ContentSource } from '../content/content-source';
import { ApiError, badRequest, notFound } from '../http';
import type { AccountStore, PreparationRecord } from '../store/account-store';

export interface PreparationServiceDeps {
  readonly content: ContentSource;
  readonly accounts: AccountStore;
  readonly now: () => Date;
  readonly newId: () => string;
}

/**
 * Job Role Preparation choices: a target role and saved plans. Plans are
 * lists of taxonomy term ids; job postings are analyzed in the browser and
 * never reach this service.
 */
export class PreparationService {
  constructor(private readonly deps: PreparationServiceDeps) {}

  async get(caller: Caller): Promise<PreparationResponse> {
    return this.view(await this.deps.accounts.getPreparation(caller.id));
  }

  async setTargetRole(caller: Caller, roleId: string | null): Promise<PreparationResponse> {
    if (roleId !== null) {
      const role = this.deps.content.findRole(roleId);
      if (!role) throw notFound('There is no job role with this id.');
      if (role.status !== 'available') {
        throw new ApiError(
          'conflict',
          'This role is coming soon: it has no preparation path to follow yet.',
        );
      }
    }
    const at = this.deps.now().toISOString();
    await this.deps.accounts.setTargetRole(caller.id, roleId, at);
    return this.get(caller);
  }

  async createPlan(caller: Caller, request: CreatePlanRequest): Promise<SavedPlan> {
    const unknown = request.termIds.filter((id) => !this.deps.content.hasTerm(id));
    if (unknown.length > 0) {
      throw badRequest(`Unknown taxonomy terms: ${unknown.slice(0, 5).join(', ')}.`);
    }
    const plan: SavedPlan = {
      id: this.deps.newId(),
      title: request.title,
      termIds: request.termIds,
      createdAt: this.deps.now().toISOString(),
    };
    const added = await this.deps.accounts.addPreparationPlan(
      caller.id,
      plan,
      PREPARATION_LIMITS.maxPlans,
      plan.createdAt,
    );
    if (!added) {
      throw new ApiError(
        'conflict',
        `You can keep up to ${PREPARATION_LIMITS.maxPlans} plans. Delete one to save another.`,
      );
    }
    return plan;
  }

  async deletePlan(caller: Caller, planId: string): Promise<DeletePlanResponse> {
    const deleted = await this.deps.accounts.deletePreparationPlan(
      caller.id,
      planId,
      this.deps.now().toISOString(),
    );
    if (!deleted) throw notFound('There is no saved plan with this id.');
    return { deleted: true };
  }

  /** Roles that no longer exist or are no longer available are not reported as the target. */
  private view(record: PreparationRecord | undefined): PreparationResponse {
    const role = record?.targetRoleId ? this.deps.content.findRole(record.targetRoleId) : undefined;
    return {
      targetRoleId: role?.status === 'available' ? role.id : null,
      plans: [...(record?.plans ?? [])]
        .reverse()
        .map((p) => ({ ...p, termIds: p.termIds.filter((id) => this.deps.content.hasTerm(id)) })),
    };
  }
}
