import type {
  InterviewFormat,
  LanguageId,
  PreparationPriority,
  RequirementLevel,
} from '@pracstack/content-model';

/**
 * Contracts for Job Role Preparation: the learner's target role and saved
 * preparation plans. Types only; the server validates every request.
 *
 * Privacy: job postings are analyzed in the browser and never sent. A saved
 * plan holds taxonomy term ids with their requirement level and priority,
 * interview settings, a schedule of activity keys, and the learner's marks.
 * The API accepts only these fields, so there is nowhere to put posting text
 * or evidence excerpts, and any extra field is refused.
 */

/** Interview settings (all optional except the format). */
export interface PlanSettings {
  /** 1–80 characters. */
  readonly jobTitle?: string;
  /** 1–80 characters; matched against the company catalog in the browser. */
  readonly company?: string;
  /** YYYY-MM-DD. Without it the plan is a prioritized path. */
  readonly interviewDate?: string;
  /** 15–720. */
  readonly dailyMinutes?: number;
  readonly format: InterviewFormat;
  readonly language?: LanguageId;
}

/** One requirement of a plan: a taxonomy term with how the posting asked for it. */
export interface SavedRequirement {
  readonly termId: string;
  readonly requirement: RequirementLevel;
  readonly priority: PreparationPriority;
}

/** A scheduled day: activity keys (`skill:…`, `challenge:…`, `external:<term>`, `review:<n>`, `mock:interview`). */
export interface SavedScheduleDay {
  /** YYYY-MM-DD */
  readonly date: string;
  readonly items: readonly { readonly key: string; readonly minutes: number }[];
}

/** A preparation plan saved from the job description analyzer. */
export interface SavedPlan {
  /** UUID assigned by the server. */
  readonly id: string;
  /** 1–80 characters, sanitized like display names. */
  readonly title: string;
  /** Taxonomy term ids (taxonomy.json); the path is rebuilt from them. */
  readonly termIds: readonly string[];
  /** ISO timestamp. */
  readonly createdAt: string;
  /** ISO timestamp of the last change (plans saved before study plans have none). */
  readonly updatedAt?: string;
  /** Plans saved before the study planner have no settings, requirements or schedule. */
  readonly settings?: PlanSettings;
  readonly requirements?: readonly SavedRequirement[];
  readonly schedule?: readonly SavedScheduleDay[];
  /** Keys the learner marked done (external study, reviews, mock interviews). */
  readonly done?: readonly string[];
  /** Keys the learner chose to skip. */
  readonly skipped?: readonly string[];
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
  readonly settings?: PlanSettings;
  readonly requirements?: readonly SavedRequirement[];
  readonly schedule?: readonly SavedScheduleDay[];
  readonly done?: readonly string[];
  readonly skipped?: readonly string[];
}

/**
 * PATCH /api/me/preparation/plans/:id (responds with SavedPlan). Only the
 * fields given change; `schedule: null` removes the schedule.
 */
export interface UpdatePlanRequest {
  readonly title?: string;
  readonly settings?: PlanSettings;
  readonly requirements?: readonly SavedRequirement[];
  readonly schedule?: readonly SavedScheduleDay[] | null;
  readonly done?: readonly string[];
  readonly skipped?: readonly string[];
}

/** DELETE /api/me/preparation/plans/:id */
export interface DeletePlanResponse {
  readonly deleted: true;
}

export const PREPARATION_LIMITS = {
  maxPlans: 10,
  maxPlanTitle: 80,
  maxPlanTerms: 60,
  maxSettingText: 80,
  maxScheduleDays: 120,
  maxItemsPerDay: 30,
  maxMarks: 400,
  maxKeyLength: 120,
} as const;

/** Activity keys a plan may store (see activityKey in @pracstack/content-model). */
export const PLAN_KEY_PATTERN =
  /^(?:skill:[a-z0-9-]+|challenge:[a-z0-9-]+(?::(?:typescript|java|csharp|python|swift))?|web-challenge:[a-z0-9-]+(?::(?:aspnetcore|spring-boot|django|angular))?|scenario:[a-z0-9-]+|external:[a-z0-9-]+|review:\d{1,3}|mock:interview)$/;
