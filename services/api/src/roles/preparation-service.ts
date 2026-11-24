import {
  type CreatePlanRequest,
  type DeletePlanResponse,
  PREPARATION_LIMITS,
  type PreparationResponse,
  type SavedPlan,
  type UpdatePlanRequest,
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
    this.checkTerms([...request.termIds, ...(request.requirements ?? []).map((r) => r.termId)]);
    const createdAt = this.deps.now().toISOString();
    const plan: SavedPlan = {
      id: this.deps.newId(),
      title: request.title,
      termIds: request.termIds,
      createdAt,
      updatedAt: createdAt,
      ...(request.settings ? { settings: request.settings } : {}),
      ...(request.requirements ? { requirements: request.requirements } : {}),
      ...(request.schedule ? { schedule: request.schedule } : {}),
      ...(request.done ? { done: request.done } : {}),
      ...(request.skipped ? { skipped: request.skipped } : {}),
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

  /**
   * Renames a plan, changes its settings or schedule, or records marks. Only
   * the caller's own plans can be found: plans are stored per user.
   */
  async updatePlan(caller: Caller, planId: string, request: UpdatePlanRequest): Promise<SavedPlan> {
    const record = await this.deps.accounts.getPreparation(caller.id);
    const current = record?.plans.find((p) => p.id === planId);
    if (!current) throw notFound('There is no saved plan with this id.');
    if (request.requirements) this.checkTerms(request.requirements.map((r) => r.termId));
    const updatedAt = this.deps.now().toISOString();
    const { schedule: previousSchedule, ...rest } = current;
    const schedule = request.schedule === null ? undefined : (request.schedule ?? previousSchedule);
    const plan: SavedPlan = {
      ...rest,
      ...(request.title !== undefined ? { title: request.title } : {}),
      ...(request.settings ? { settings: request.settings } : {}),
      ...(request.requirements
        ? {
            requirements: request.requirements,
            termIds: request.requirements.map((r) => r.termId),
          }
        : {}),
      ...(schedule ? { schedule } : {}),
      ...(request.done ? { done: request.done } : {}),
      ...(request.skipped ? { skipped: request.skipped } : {}),
      updatedAt,
    };
    const updated = await this.deps.accounts.updatePreparationPlan(caller.id, plan, updatedAt);
    if (!updated) throw notFound('There is no saved plan with this id.');
    return this.cleanPlan(plan);
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
      plans: [...(record?.plans ?? [])].reverse().map((p) => this.cleanPlan(p)),
    };
  }

  /** Terms that no longer exist are left out. */
  private cleanPlan(plan: SavedPlan): SavedPlan {
    const has = (id: string) => this.deps.content.hasTerm(id);
    return {
      ...plan,
      termIds: plan.termIds.filter(has),
      ...(plan.requirements
        ? { requirements: plan.requirements.filter((r) => has(r.termId)) }
        : {}),
    };
  }

  private checkTerms(termIds: readonly string[]): void {
    const unknown = termIds.filter((id) => !this.deps.content.hasTerm(id));
    if (unknown.length > 0) {
      throw badRequest(`Unknown taxonomy terms: ${unknown.slice(0, 5).join(', ')}.`);
    }
  }
}
