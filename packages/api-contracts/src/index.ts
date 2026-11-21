/**
 * HTTP API contracts shared by the browser and the API. Types only: the
 * server validates every request body at runtime and never trusts these
 * shapes on input.
 *
 * All routes are under `/api`. Errors use {@link ApiErrorBody} with a
 * non-2xx status.
 */
import type { InstructionBlock, PublicQuestion } from '@pracstack/content-model';

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
  /** 0–100. */
  readonly score: number;
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
