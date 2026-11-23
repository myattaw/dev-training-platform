/**
 * HTTP API contracts shared by the browser and the API. Types only: the
 * server validates every request body at runtime and never trusts these
 * shapes on input.
 *
 * All routes are under `/api`. Errors use {@link ApiErrorBody} with a
 * non-2xx status.
 */
import type { InstructionBlock, LanguageId, PublicQuestion } from '@pracstack/content-model';

export interface ApiErrorBody {
  readonly error: {
    /** Stable, machine-readable code, e.g. `token-expired`. */
    readonly code: ApiErrorCode;
    /** Human-readable explanation, safe to show to the learner. */
    readonly message: string;
  };
}

export type ApiErrorCode =
  | 'bad-request'
  | 'unauthorized'
  | 'not-found'
  | 'token-expired'
  | 'rate-limited'
  | 'conflict'
  /** A dependency (e.g. the code runner) is not available right now. */
  | 'unavailable'
  /** Signed in, but the plan does not include this. */
  | 'forbidden'
  /** A timed interview session's deadline has passed. */
  | 'session-expired'
  | 'internal';

export interface UserInfo {
  readonly id: string;
  readonly displayName: string;
  /** `local-dev`: unauthenticated local development user. */
  readonly mode: 'local-dev' | 'authenticated';
}

/** GET /api/me */
export interface MeResponse {
  readonly user: UserInfo;
  /** Total XP across all skills. Never decreases. */
  readonly xp: number;
}

export interface SkillProgress {
  readonly skillId: string;
  /** 0–100: demonstrated proficiency. */
  readonly score: number;
  /**
   * Difficulty tier (1 Beginner … 5 Expert) of the questions this learner gets
   * next. Separate from the score: it moves up after two first-time correct
   * answers in a row, and down after two misses in a row (docs/scoring.md).
   */
  readonly tier: number;
  readonly mastered: boolean;
  readonly attempts: number;
  /** ISO timestamp of the last answer, if any. */
  readonly lastPracticedAt?: string;
}

/** GET /api/skill-mastery/progress?technologyId=… */
export interface ProgressResponse {
  readonly technologyId: string;
  /** Only skills with at least one attempt are listed. */
  readonly skills: readonly SkillProgress[];
}

/** POST /api/skill-mastery/practice/next */
export interface NextQuestionRequest {
  readonly skillId: string;
}

export interface NextQuestionResponse {
  /** Opaque, single-use token identifying this served question. */
  readonly token: string;
  readonly question: PublicQuestion;
  readonly skill: SkillProgress;
  /** Hints already revealed for this token (when resuming an unanswered question). */
  readonly hintsRevealed: readonly string[];
  /** ISO timestamp after which the token can no longer be answered. */
  readonly expiresAt: string;
  /** Why this question was chosen. */
  readonly selection: QuestionSelection;
}

/**
 * `new`: not answered before. `review`: answered wrongly earlier, back for
 * review. `repeat`: every question in the skill has been answered; repeats earn
 * reduced credit and don't count toward mastery.
 */
export interface QuestionSelection {
  readonly reason: 'new' | 'review' | 'repeat';
  /** A sentence for the learner when the choice needs explaining. */
  readonly note?: string;
}

/** POST /api/skill-mastery/practice/hint */
export interface HintRequest {
  readonly token: string;
}

export interface HintResponse {
  readonly hint: string;
  /** Zero-based index of this hint. */
  readonly index: number;
  readonly remaining: number;
}

export type AnswerPayload =
  | { readonly format: 'multiple-choice'; readonly selected: readonly string[] }
  | { readonly format: 'predict-output'; readonly output: string }
  | { readonly format: 'fill-in-blank'; readonly blanks: Readonly<Record<string, string>> }
  | { readonly format: 'sql-query'; readonly query: string };

/** POST /api/skill-mastery/practice/answer */
export interface AnswerRequest {
  readonly token: string;
  readonly answer: AnswerPayload;
}

export type AnswerResult = 'correct' | 'partial' | 'incorrect';

/** The correct answer, revealed after the learner submits. */
export type RevealedAnswer =
  | { readonly format: 'multiple-choice'; readonly correct: readonly string[] }
  | { readonly format: 'predict-output'; readonly output: string }
  | {
      readonly format: 'fill-in-blank';
      /** One accepted answer per blank. */
      readonly blanks: Readonly<Record<string, string>>;
      /** Whether the learner's value for each blank was accepted. */
      readonly blankResults: Readonly<Record<string, boolean>>;
    }
  | { readonly format: 'sql-query'; readonly referenceQuery: string };

export interface AnswerResponse {
  readonly result: AnswerResult;
  /** Why the answer was partial, when it was (e.g. "Right values, different spacing"). */
  readonly resultNote?: string;
  readonly correctAnswer: RevealedAnswer;
  readonly explanation: readonly InstructionBlock[];
  readonly scoreBefore: number;
  readonly scoreAfter: number;
  readonly xpAwarded: number;
  readonly masteredNow: boolean;
  readonly checkpointReached?: number;
  readonly skill: SkillProgress;
  /** Difficulty tier before and after this answer. */
  readonly tierBefore: number;
  readonly tierAfter: number;
  /** This question had been answered correctly before (reduced credit). */
  readonly repeat: boolean;
  /** The score did not rise (fully) because this question's tier caps it lower. */
  readonly cappedByTier: boolean;
}

export interface AttemptSummary {
  readonly attemptId: string;
  readonly questionId: string;
  readonly difficulty: number;
  readonly result: AnswerResult;
  readonly hintsUsed: number;
  readonly scoreBefore: number;
  readonly scoreAfter: number;
  readonly xpAwarded: number;
  readonly answeredAt: string;
}

/** GET /api/skill-mastery/skills/:skillId/history */
export interface HistoryResponse {
  readonly skill: SkillProgress;
  /** Most recent first. */
  readonly attempts: readonly AttemptSummary[];
}

/** A query result, as shown to the learner. */
export interface SqlResultTable {
  readonly columns: readonly { readonly name: string; readonly type: string }[];
  readonly rows: readonly (readonly (string | number | boolean | null)[])[];
  /** More rows exist than are shown. */
  readonly truncated: boolean;
}

/**
 * POST /api/skill-mastery/practice/run-sql
 *
 * Runs a query against the sample data of the current SQL question, without
 * grading or scoring, so learners can explore before submitting.
 */
export interface RunSqlRequest {
  readonly token: string;
  readonly query: string;
}

export type RunSqlResponse =
  | { readonly kind: 'rows'; readonly table: SqlResultTable; readonly durationMs: number }
  /** The query failed, was refused, or exceeded a limit. The message explains why. */
  | { readonly kind: 'error'; readonly message: string };

/** Limits the server enforces on answers; the UI uses them for input `maxlength`. */
export const ANSWER_LIMITS = {
  maxOutputLength: 2000,
  maxBlankLength: 200,
  maxSelected: 10,
  maxQueryLength: 5000,
} as const;

/* ---------------- Coding challenges ---------------- */

/** One graded test, as shown to the learner (visible tests only). */
export interface ChallengeTestResult {
  readonly description: string;
  readonly passed: boolean;
  readonly input: string;
  readonly expected: string;
  readonly actual?: string;
  readonly error?: string;
}

export interface CodeDiagnostic {
  readonly line: number;
  readonly column: number;
  readonly message: string;
}

/** POST /api/challenges/:id/run and /api/challenges/:id/submissions */
export interface ChallengeCodeRequest {
  readonly language: LanguageId;
  readonly code: string;
}

/** Outcome of executing code on the server, before or without hidden tests. */
export type ExecutionDetail =
  | { readonly status: 'passed' | 'failed'; readonly results: readonly ChallengeTestResult[] }
  | { readonly status: 'compile-error'; readonly diagnostics: readonly CodeDiagnostic[] }
  | { readonly status: 'runtime-error'; readonly message: string }
  | { readonly status: 'timeout'; readonly timeoutMs: number }
  | { readonly status: 'resource-limit'; readonly message: string };

/** POST /api/challenges/:id/run: visible tests only; nothing is stored. */
export interface ChallengeRunResponse {
  readonly detail: ExecutionDetail;
  /** Console output of the run (visible tests only). */
  readonly logs: readonly string[];
  readonly durationMs: number;
}

export type SubmissionStatus =
  'accepted' | 'failed' | 'compile-error' | 'runtime-error' | 'timeout' | 'resource-limit';

export interface SubmissionSummary {
  readonly id: string;
  readonly challengeId: string;
  readonly challengeVersion: number;
  readonly language: LanguageId;
  readonly status: SubmissionStatus;
  readonly visiblePassed: number;
  readonly visibleTotal: number;
  readonly hiddenPassed: number;
  readonly hiddenTotal: number;
  readonly durationMs: number;
  readonly submittedAt: string;
}

/**
 * POST /api/challenges/:id/submissions: visible and hidden tests. Visible
 * tests are reported in full; hidden tests only as counts.
 */
export interface SubmissionResponse {
  readonly submission: SubmissionSummary;
  /** Visible-test details, compile errors, or the reason the run stopped. */
  readonly detail: ExecutionDetail;
  /** True the first time this challenge is solved. */
  readonly solvedNow: boolean;
}

/** GET /api/challenges/:id/submissions */
export interface SubmissionListResponse {
  /** Most recent first. */
  readonly submissions: readonly SubmissionSummary[];
}

export interface ChallengeProgress {
  readonly challengeId: string;
  readonly solved: boolean;
  readonly solvedAt?: string;
  readonly attempts: number;
  readonly lastSubmittedAt: string;
  readonly languagesSolved: readonly LanguageId[];
}

/** GET /api/challenges/progress: only challenges with at least one submission. */
export interface ChallengeProgressResponse {
  readonly challenges: readonly ChallengeProgress[];
}

export const CODE_LIMITS = {
  maxCodeLength: 64 * 1024,
} as const;

export * from './prep';
export * from './preparation';
export * from './scenarios';
