/**
 * Contracts for Job Role Preparation: the learner's target role and saved
 * preparation plans. Types only; the server validates every request.
 *
 * Privacy: job postings are analysed in the browser and never sent. A saved
 * plan holds only taxonomy term ids (and a title the learner chooses), so the
 * API has nowhere to put posting text, and it rejects any extra field.
 */

/** A preparation plan saved from the job description analyzer. */
export interface SavedPlan {
  /** UUID assigned by the server. */
  readonly id: string;
  /** 1–80 characters, sanitised like display names. */
  readonly title: string;
  /** Taxonomy term ids (taxonomy.json); the path is rebuilt from them. */
  readonly termIds: readonly string[];
  /** ISO timestamp. */
  readonly createdAt: string;
}

/** GET /api/me/preparation */
export interface PreparationResponse {
  /** An available job role id, or null when none is chosen. */
  readonly targetRoleId: string | null;
  /** Newest first. */
  readonly plans: readonly SavedPlan[];
}

/** PUT /api/me/preparation/target-role (responds with PreparationResponse) */
export interface SetTargetRoleRequest {
  /** An available role id; null clears the target. */
  readonly roleId: string | null;
}

/** POST /api/me/preparation/plans (responds with SavedPlan) */
export interface CreatePlanRequest {
  readonly title: string;
  readonly termIds: readonly string[];
}

/** DELETE /api/me/preparation/plans/:id */
export interface DeletePlanResponse {
  readonly deleted: true;
}

export const PREPARATION_LIMITS = {
  maxPlans: 10,
  maxPlanTitle: 80,
  maxPlanTerms: 60,
} as const;
