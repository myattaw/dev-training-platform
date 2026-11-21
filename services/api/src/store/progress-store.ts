import type { AnswerResponse, AnswerResult } from '@pracstack/api-contracts';
import type { MasteryState } from '@pracstack/scoring';

/*
 * Persistence model. Shaped for DynamoDB (Phase 6): every record is keyed by
 * user, and an answer is one conditional transaction (token + attempt +
 * mastery + XP), so a token can never be scored twice.
 */

export interface MasteryRecord {
  readonly userId: string;
  readonly skillId: string;
  readonly technologyId: string;
  readonly state: MasteryState;
  /** Incremented on every write; used for optimistic concurrency. */
  readonly revision: number;
  readonly lastPracticedAt: string;
}

/** A question served to a learner. Single use. */
export interface QuestionToken {
  readonly id: string;
  readonly userId: string;
  readonly skillId: string;
  readonly questionId: string;
  readonly questionVersion: number;
  readonly issuedAt: string;
  readonly expiresAt: string;
  /** Hints revealed so far. Tracked on the server, so hint use can't be hidden. */
  readonly hintsRevealed: number;
  /** Set once answered; the attempt holds the stored response. */
  readonly attemptId?: string;
}

export interface AttemptRecord {
  readonly attemptId: string;
  readonly userId: string;
  readonly skillId: string;
  readonly questionId: string;
  readonly questionVersion: number;
  readonly contentVersion: string;
  readonly difficulty: number;
  readonly result: AnswerResult;
  readonly hintsUsed: number;
  readonly scoreBefore: number;
  readonly scoreAfter: number;
  readonly xpAwarded: number;
  readonly answeredAt: string;
  /** The exact response returned, replayed if the same token is answered again. */
  readonly response: AnswerResponse;
}

export interface RecordAnswer {
  readonly tokenId: string;
  readonly attempt: AttemptRecord;
  readonly mastery: MasteryRecord;
  /** Revision of the mastery record the answer was computed from (0 = none). */
  readonly expectedRevision: number;
}

export type RecordAnswerOutcome =
  | { readonly kind: 'recorded' }
  /** The token was answered meanwhile; here is that attempt. */
  | { readonly kind: 'already-answered'; readonly attempt: AttemptRecord }
  /** Mastery changed meanwhile (another answer); recompute and retry. */
  | { readonly kind: 'conflict' };

export interface ProgressStore {
  getMastery(userId: string, skillId: string): Promise<MasteryRecord | undefined>;
  listMastery(userId: string): Promise<readonly MasteryRecord[]>;
  getXp(userId: string): Promise<number>;

  putToken(token: QuestionToken): Promise<void>;
  getToken(tokenId: string): Promise<QuestionToken | undefined>;
  /** The newest unanswered token for this user and skill, if any. */
  findOpenToken(userId: string, skillId: string): Promise<QuestionToken | undefined>;
  /** Increments `hintsRevealed` if still unanswered; returns the updated token. */
  revealHint(tokenId: string, maxHints: number): Promise<QuestionToken | undefined>;
  deleteToken(tokenId: string): Promise<void>;

  getAttempt(attemptId: string): Promise<AttemptRecord | undefined>;
  /** Most recent first. */
  listAttempts(userId: string, skillId: string, limit: number): Promise<readonly AttemptRecord[]>;

  /** Atomically: mark the token answered, store the attempt, update mastery and XP. */
  recordAnswer(input: RecordAnswer): Promise<RecordAnswerOutcome>;
}
