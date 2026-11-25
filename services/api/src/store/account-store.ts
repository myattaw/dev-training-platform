import type { ScenarioProgressRecord } from '../scenarios/scenario-service';
import type {
  InterviewDuration,
  InterviewResult,
  InterviewSessionStatus,
  PlanSettings,
  ProgressImportResponse,
  SavedRequirement,
  SavedScheduleDay,
} from '@pracstack/api-contracts';
import type { LanguageId } from '@pracstack/content-model';

/*
 * Account-level records: profile, plan, linked identities, company
 * preparation, job role preparation, timed interview sessions, drafts and
 * progress imports.
 * Every record is keyed by user, like the rest of the progress store.
 */

export interface ProfileRecord {
  readonly userId: string;
  readonly displayName?: string;
  readonly updatedAt: string;
}

/**
 * A plan granted to a user. Written only by trusted server-side code (an
 * operator script today; a billing webhook later), never by an API request.
 */
export interface EntitlementRecord {
  readonly userId: string;
  readonly plan: 'free' | 'pro';
  readonly source: 'manual-grant' | 'billing';
  readonly grantedAt: string;
  /** ISO; the grant ends at this time (e.g. end of a billing period). */
  readonly expiresAt?: string;
  /** Billing provider reference (e.g. a subscription id), when `source` is `billing`. */
  readonly externalReference?: string;
}

/** Maps an identity at a provider to the stable internal user id. */
export interface IdentityRecord {
  /** Issuer, e.g. the Cognito user pool URL, or `local-dev`. */
  readonly provider: string;
  readonly subject: string;
  readonly userId: string;
  readonly linkedAt: string;
  /** How this identity signs in ("Google", "GitHub"); absent for email and password. */
  readonly method?: string;
}

/** Proof, issued to a signed-in user, that lets another identity join their account. */
export interface LinkIntentRecord {
  readonly token: string;
  readonly userId: string;
  readonly expiresAt: string;
  readonly usedAt?: string;
}

export interface SavedCompanyRecord {
  readonly userId: string;
  readonly companyId: string;
  readonly savedAt: string;
}

/** A learner's own mark on an external question (PracStack cannot verify it). */
export interface QuestionMarkRecord {
  readonly userId: string;
  readonly companyId: string;
  readonly questionId: string;
  readonly status: 'reviewed-externally' | 'solved-externally';
  readonly updatedAt: string;
}

export interface InterviewSessionRecord {
  readonly id: string;
  readonly userId: string;
  readonly clientRequestId: string;
  readonly companyId: string;
  readonly challengeId: string;
  readonly language: LanguageId;
  readonly durationMinutes: InterviewDuration;
  readonly startedAt: string;
  readonly deadline: string;
  readonly finishedAt?: string;
  /** Stored status; `active` sessions past their deadline are reported as expired. */
  readonly status: InterviewSessionStatus;
  readonly submissions: number;
  readonly best?: InterviewResult;
  /** Incremented on every write; used for optimistic concurrency. */
  readonly revision: number;
}

export interface DraftRecord {
  readonly userId: string;
  readonly challengeId: string;
  readonly language: LanguageId;
  readonly code: string;
  readonly updatedAt: string;
}

export interface ImportRecord {
  readonly userId: string;
  readonly importId: string;
  readonly response: ProgressImportResponse;
  readonly importedAt: string;
}

/**
 * A preparation plan: taxonomy term ids, requirement levels, interview
 * settings, a schedule of activity keys and the learner's marks. Never
 * job-posting text or evidence excerpts.
 */
export interface SavedPlanRecord {
  readonly id: string;
  readonly title: string;
  readonly termIds: readonly string[];
  readonly createdAt: string;
  readonly updatedAt?: string;
  readonly settings?: PlanSettings;
  readonly requirements?: readonly SavedRequirement[];
  readonly schedule?: readonly SavedScheduleDay[];
  readonly done?: readonly string[];
  readonly skipped?: readonly string[];
}

/** Job Role Preparation choices: one record per user. */
export interface PreparationRecord {
  readonly userId: string;
  readonly targetRoleId?: string;
  /** In creation order. */
  readonly plans: readonly SavedPlanRecord[];
  readonly updatedAt: string;
}

export type CreateSessionOutcome =
  | { readonly kind: 'created' }
  /** A session was already created for this client request id. */
  | { readonly kind: 'existing'; readonly session: InterviewSessionRecord };

export interface AccountStore {
  getProfile(userId: string): Promise<ProfileRecord | undefined>;
  putProfile(profile: ProfileRecord): Promise<void>;

  getEntitlement(userId: string): Promise<EntitlementRecord | undefined>;
  putEntitlement(entitlement: EntitlementRecord): Promise<void>;

  getIdentity(provider: string, subject: string): Promise<IdentityRecord | undefined>;
  /** Stores the mapping unless one exists; returns the stored mapping either way. */
  putIdentityIfAbsent(identity: IdentityRecord): Promise<IdentityRecord>;
  /** Moves an identity to another user (account linking). */
  replaceIdentity(identity: IdentityRecord, previousUserId: string): Promise<boolean>;
  /**
   * Records the sign-in method label of an identity saved without one; the
   * mapping itself (which user) is unchanged. False when it changed meanwhile.
   */
  setIdentityMethod(identity: IdentityRecord & { readonly method: string }): Promise<boolean>;
  listIdentities(userId: string): Promise<readonly IdentityRecord[]>;
  putLinkIntent(intent: LinkIntentRecord): Promise<void>;
  /** Marks an unused, unexpired intent used; returns it, or undefined if it cannot be used. */
  consumeLinkIntent(token: string, at: string): Promise<LinkIntentRecord | undefined>;
  /** Whether a user has any stored progress (used before relinking an identity). */
  hasUserData(userId: string): Promise<boolean>;

  saveCompany(record: SavedCompanyRecord): Promise<void>;
  unsaveCompany(userId: string, companyId: string): Promise<void>;
  listSavedCompanies(userId: string): Promise<readonly SavedCompanyRecord[]>;

  /** `not-started` removes the mark. */
  setQuestionMark(
    record: Omit<QuestionMarkRecord, 'status'> & {
      status: QuestionMarkRecord['status'] | 'not-started';
    },
  ): Promise<void>;
  listQuestionMarks(userId: string): Promise<readonly QuestionMarkRecord[]>;

  /** Enterprise Scenarios: answers to question tasks, one record per scenario. */
  getScenarioProgress(
    userId: string,
    scenarioId: string,
  ): Promise<ScenarioProgressRecord | undefined>;
  putScenarioProgress(record: ScenarioProgressRecord): Promise<void>;
  listScenarioProgress(userId: string): Promise<readonly ScenarioProgressRecord[]>;

  getPreparation(userId: string): Promise<PreparationRecord | undefined>;
  /** `null` clears the target role. */
  setTargetRole(userId: string, roleId: string | null, updatedAt: string): Promise<void>;
  /** Appends a plan unless the user already has `maxPlans`; false when full (atomic). */
  addPreparationPlan(
    userId: string,
    plan: SavedPlanRecord,
    maxPlans: number,
    updatedAt: string,
  ): Promise<boolean>;
  /** Replaces the user's plan with the same id; false when they have none (atomic). */
  updatePreparationPlan(userId: string, plan: SavedPlanRecord, updatedAt: string): Promise<boolean>;
  /** False when the user has no plan with this id. */
  deletePreparationPlan(userId: string, planId: string, updatedAt: string): Promise<boolean>;

  /** Creates a session, once per (user, clientRequestId). */
  createInterviewSession(session: InterviewSessionRecord): Promise<CreateSessionOutcome>;
  getInterviewSession(
    userId: string,
    sessionId: string,
  ): Promise<InterviewSessionRecord | undefined>;
  /** Writes if the stored revision is `session.revision - 1`; false on a concurrent change. */
  updateInterviewSession(session: InterviewSessionRecord): Promise<boolean>;
  /** Most recent first. */
  listInterviewSessions(userId: string, limit: number): Promise<readonly InterviewSessionRecord[]>;

  getDraft(
    userId: string,
    challengeId: string,
    language: LanguageId,
  ): Promise<DraftRecord | undefined>;
  putDraft(draft: DraftRecord): Promise<void>;
  listDrafts(userId: string): Promise<readonly DraftRecord[]>;

  getImport(userId: string, importId: string): Promise<ImportRecord | undefined>;
  /** Stores the import result unless one exists for this id; returns the stored one. */
  putImportIfAbsent(record: ImportRecord): Promise<ImportRecord>;
}
