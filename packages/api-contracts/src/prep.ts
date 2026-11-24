/**
 * Contracts for accounts, entitlements, Company Interview Prep and timed
 * interview practice. Types only; the server validates every request.
 */
import type {
  ChallengeCategory,
  Difficulty,
  LanguageId,
  ObservationWindow,
} from '@pracstack/content-model';
import type { ChallengeProgress, SubmissionResponse, SubmissionStatus } from './index';

/* ---------------- Accounts and entitlements ---------------- */

/**
 * Access level. Decided only on the server, from its own records (or, for
 * ADMIN, a verified identity-provider group); never from anything the
 * browser sends.
 */
export type Plan = 'free' | 'pro' | 'admin';

/** Capabilities a plan unlocks (services/api/src/account/entitlements.ts). */
export type Feature =
  | 'premium-recommendations'
  | 'advanced-preparation-plans'
  | 'advanced-mock-interviews'
  | 'progress-analytics';

/** How the current plan was granted. `default`: nothing was granted (FREE). */
export type EntitlementSource =
  'default' | 'manual-grant' | 'billing' | 'identity-group' | 'local-override';

/** GET /api/me/entitlements */
export interface EntitlementsResponse {
  readonly plan: Plan;
  readonly source: EntitlementSource;
  readonly features: readonly Feature[];
  /** Paid plans cannot be bought yet: no billing provider is connected. */
  readonly billing: { readonly available: false };
}

/** PATCH /api/me */
export interface UpdateProfileRequest {
  /** 1–60 characters; shown in the app instead of the identity provider's name. */
  readonly displayName: string;
}

/** A challenge draft saved to the account (imported from a browser). */
export interface DraftSummary {
  readonly challengeId: string;
  readonly language: LanguageId;
  readonly updatedAt: string;
  readonly length: number;
}

/** GET /api/me/progress: an overview across the whole app. */
export interface AccountProgressResponse {
  readonly xp: number;
  readonly skills: { readonly practiced: number; readonly mastered: number };
  readonly challenges: readonly ChallengeProgress[];
  readonly drafts: readonly DraftSummary[];
  readonly savedCompanies: readonly string[];
  readonly interviewSessions: { readonly completed: number; readonly total: number };
}

/** One draft from the browser's local storage. */
export interface ImportedDraft {
  readonly challengeId: string;
  readonly language: LanguageId;
  readonly code: string;
  /** When the draft was last edited in the browser (ISO). */
  readonly updatedAt: string;
}

/**
 * POST /api/me/progress/import
 *
 * Copies browser-only progress into the account. Only drafts are imported:
 * local "visible tests passed" results were never verified, so they are not
 * turned into solved challenges.
 */
export interface ProgressImportRequest {
  /** Client-generated UUID; repeating an import with the same id returns the stored result. */
  readonly importId: string;
  readonly drafts: readonly ImportedDraft[];
  /** Replace these account drafts even if they differ (`<challengeId>:<language>`). */
  readonly overwrite?: readonly string[];
}

export interface DraftImportConflict {
  readonly challengeId: string;
  readonly language: LanguageId;
  /** Why it was not imported, e.g. "The account has a newer draft." */
  readonly reason: string;
}

export interface ProgressImportResponse {
  readonly importId: string;
  readonly imported: number;
  /** Identical to what the account already has. */
  readonly unchanged: number;
  readonly conflicts: readonly DraftImportConflict[];
  /** This import id was already processed; nothing changed now. */
  readonly replayed: boolean;
}

/** GET /api/me/drafts/:challengeId/:language */
export interface DraftResponse {
  readonly challengeId: string;
  readonly language: LanguageId;
  readonly code: string;
  readonly updatedAt: string;
}

export const PROFILE_LIMITS = {
  maxDisplayName: 60,
  maxImportDrafts: 100,
} as const;

/* ---------------- Company Interview Prep ---------------- */

export interface SourceInfo {
  readonly id: string;
  readonly name: string;
  readonly url: string;
  readonly provider: string;
  readonly providerUrl: string;
  /** ISO date of the source's snapshot. */
  readonly snapshotDate: string;
  readonly licenseStatus: 'unverified' | 'licensed';
}

export type CompanyPrepStatus = 'not-started' | 'in-progress' | 'completed';

export interface CompanySummary {
  readonly slug: string;
  readonly displayName: string;
  readonly aliases: readonly string[];
  /** Reported questions available in PracStack. */
  readonly questionCount: number;
  /** Questions the source lists in total, when PracStack holds only a sample. */
  readonly sourceQuestionCount?: number;
  readonly saved: boolean;
}

/** GET /api/companies?q=&letter=&page= */
export interface CompanyListResponse {
  readonly companies: readonly CompanySummary[];
  /** Matches before paging. */
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  /** First letters (A–Z, or `#`) that have at least one company. */
  readonly letters: readonly string[];
}

export const COMPANY_PAGE_SIZE = 25;

/**
 * Learner-reported state of an external question. PracStack cannot see
 * activity on the provider; these are the learner's own marks.
 */
export type ReportedQuestionStatus = 'not-started' | 'reviewed-externally' | 'solved-externally';

export interface ReportedQuestion {
  /** `<source>:<externalId>`. */
  readonly id: string;
  readonly title: string;
  readonly difficulty: Difficulty;
  readonly provider: string;
  readonly externalId: string;
  readonly externalUrl: string;
  readonly sourceId: string;
  /** Acceptance rate on the provider, as stated by the source. */
  readonly acceptanceRate?: number;
  /** The source's lists this question appears in, with its frequency value there. */
  readonly windows: readonly {
    readonly window: ObservationWindow;
    readonly reportedFrequency?: number;
  }[];
  /** Original PracStack challenges that practice related skills. */
  readonly relatedChallenges: readonly { readonly id: string; readonly title: string }[];
  readonly status: ReportedQuestionStatus;
}

export interface CompanyProgress {
  readonly status: CompanyPrepStatus;
  readonly questionsTotal: number;
  readonly questionsReviewed: number;
  readonly questionsSolvedExternally: number;
  /** Recommended PracStack challenges you can practice, and how many you solved (server-graded). */
  readonly practiceTotal: number;
  readonly practiceSolved: number;
  readonly timedSessionsCompleted: number;
  readonly lastActivityAt?: string;
}

export type PreparationTargetView =
  | { readonly kind: 'challenge'; readonly challengeId: string; readonly title: string }
  | {
      readonly kind: 'skill';
      readonly skillId: string;
      readonly technologyId: string;
      readonly title: string;
    }
  | { readonly kind: 'timed-session' };

export interface PreparationStepView {
  readonly title: string;
  readonly description: string;
  readonly target: PreparationTargetView;
  readonly done: boolean;
}

export interface PreparationPathView {
  readonly id: string;
  readonly title: string;
  readonly summary: string;
  readonly steps: readonly PreparationStepView[];
}

/** GET /api/companies/:slug */
export interface CompanyDetailResponse {
  readonly company: CompanySummary;
  readonly sources: readonly SourceInfo[];
  readonly questions: readonly ReportedQuestion[];
  readonly progress: CompanyProgress;
  readonly preparationPaths: readonly PreparationPathView[];
}

export interface RecommendationView {
  readonly challengeId: string;
  readonly title: string;
  readonly summary: string;
  readonly difficulty: Difficulty;
  readonly category: ChallengeCategory;
  readonly reason: string;
  /** Human-readable competencies. */
  readonly competencies: readonly string[];
  readonly confidence: 'high' | 'medium' | 'low';
  /** `curated`: chosen by an editor. `computed`: ranked by shared competencies. */
  readonly origin: 'curated' | 'computed';
  readonly relatedQuestion?: { readonly id: string; readonly title: string };
  readonly access: 'free' | 'pro';
  readonly availability: 'available' | 'coming-soon';
  /** Pro content that the caller's plan does not include. */
  readonly locked: boolean;
  /** Solved with a server-graded submission. */
  readonly solved: boolean;
}

/** GET /api/companies/:slug/recommendations */
export interface RecommendationsResponse {
  readonly recommendations: readonly RecommendationView[];
  readonly plan: Plan;
}

/** PUT /api/me/companies/:slug/questions/:questionId */
export interface SetQuestionStatusRequest {
  readonly status: ReportedQuestionStatus;
}

/** GET /api/me/companies: saved companies, most recently active first. */
export interface SavedCompaniesResponse {
  readonly companies: readonly (CompanySummary & { readonly progress: CompanyProgress })[];
}

/* ---------------- Timed interview practice ---------------- */

export const INTERVIEW_DURATIONS = [30, 45, 60, 90] as const;
export type InterviewDuration = (typeof INTERVIEW_DURATIONS)[number];

/**
 * `active`: the deadline has not passed. `completed`: finished in time.
 * `expired`: the deadline passed (enforced by the server). `abandoned`: exited early.
 */
export type InterviewSessionStatus = 'active' | 'completed' | 'expired' | 'abandoned';

export interface InterviewResult {
  readonly status: SubmissionStatus;
  readonly visiblePassed: number;
  readonly visibleTotal: number;
  readonly hiddenPassed: number;
  readonly hiddenTotal: number;
}

export interface InterviewSession {
  readonly id: string;
  readonly companySlug: string;
  readonly companyName: string;
  readonly challengeId: string;
  readonly challengeTitle: string;
  readonly difficulty: Difficulty;
  readonly language: LanguageId;
  readonly durationMinutes: InterviewDuration;
  /** Server timestamps (ISO). The deadline is fixed when the session starts. */
  readonly startedAt: string;
  readonly deadline: string;
  readonly finishedAt?: string;
  readonly status: InterviewSessionStatus;
  /** Seconds from start to finish (or to the deadline). Computed on the server. */
  readonly timeUsedSeconds?: number;
  readonly submissions: number;
  /** Best graded submission in this session. */
  readonly best?: InterviewResult;
}

/** POST /api/interview-sessions */
export interface CreateInterviewSessionRequest {
  readonly companySlug: string;
  readonly challengeId: string;
  readonly durationMinutes: InterviewDuration;
  readonly language: LanguageId;
  /** Client-generated UUID: retrying the same request returns the same session. */
  readonly clientRequestId: string;
}

export interface InterviewSessionResponse {
  readonly session: InterviewSession;
  /** The server's clock, so the browser can correct for its own clock being off. */
  readonly serverTime: string;
}

/** POST /api/interview-sessions/:id/submit (body: ChallengeCodeRequest) */
export interface InterviewSubmitResponse extends InterviewSessionResponse {
  readonly submission: SubmissionResponse;
}

/** POST /api/interview-sessions/:id/finish */
export interface FinishInterviewRequest {
  /** `completed`: done; `abandoned`: exited early. Ignored once the deadline has passed. */
  readonly outcome: 'completed' | 'abandoned';
}

/** GET /api/interview-sessions?companySlug= */
export interface InterviewSessionListResponse {
  /** Most recent first (up to 20). */
  readonly sessions: readonly InterviewSession[];
}
