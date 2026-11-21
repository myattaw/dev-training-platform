import { SQL_DIALECT_LABELS, SQL_DIALECTS, type SqlDialect } from '@pracstack/content-model';
import type {
  AnswerRequest,
  AnswerResponse,
  AttemptSummary,
  HintResponse,
  HistoryResponse,
  NextQuestionResponse,
  ProgressResponse,
  RunSqlRequest,
  RunSqlResponse,
  SkillProgress,
  UserInfo,
} from '@pracstack/api-contracts';
import type { SqlEngine } from '@pracstack/sql-engine';
import {
  applyAttempt,
  DEFAULT_SCORING_CONFIG,
  initialState,
  type MasteryState,
  type ScoringConfig,
  targetDifficulty,
} from '@pracstack/scoring';
import type { ContentSource } from '../content/content-source';
import { ApiError, badRequest, notFound } from '../http';
import type {
  AttemptRecord,
  MasteryRecord,
  ProgressStore,
  QuestionToken,
} from '../store/progress-store';
import { gradeAnswer } from './grading';
import { selectQuestion } from './select-question';
import { SqlGrader } from './sql-grading';

export const TOKEN_TTL_MS = 30 * 60 * 1000;
const RECENT_ATTEMPTS = 6;
const HISTORY_LIMIT = 50;
const MAX_CONFLICT_RETRIES = 3;

export interface PracticeDeps {
  readonly content: ContentSource;
  readonly store: ProgressStore;
  readonly now: () => Date;
  readonly random: () => number;
  readonly newId: () => string;
  readonly scoring?: ScoringConfig;
  /** Runs SQL questions. Without it, SQL questions cannot be answered. */
  /** PostgreSQL engine (shorthand for `sqlEngines.postgresql`). */
  readonly sqlEngine?: SqlEngine;
  /** Engines per SQL dialect. SQL questions of a dialect without one are not served. */
  readonly sqlEngines?: Partial<Record<SqlDialect, SqlEngine>>;
}

/**
 * Skill Mastery practice. All scoring happens here, on the server:
 *
 * - The server picks the question and issues a single-use token. Asking for
 *   the next question while one is unanswered returns the same question, so
 *   learners cannot reroll for an easier one.
 * - Hints are revealed and counted by the server.
 * - Answering a token twice returns the original result without scoring again.
 */
export class PracticeService {
  private readonly scoring: ScoringConfig;
  private readonly sql: Partial<Record<SqlDialect, SqlGrader>> = {};

  constructor(private readonly deps: PracticeDeps) {
    this.scoring = deps.scoring ?? DEFAULT_SCORING_CONFIG;
    const engines = { postgresql: deps.sqlEngine, ...deps.sqlEngines };
    for (const dialect of SQL_DIALECTS) {
      const engine = engines[dialect];
      if (engine) this.sql[dialect] = new SqlGrader(engine);
    }
  }

  async progress(user: UserInfo, technologyId: string): Promise<ProgressResponse> {
    if (!this.deps.content.hasTechnology(technologyId)) throw notFound('Unknown technology.');
    const records = await this.deps.store.listMastery(user.id);
    return {
      technologyId,
      skills: records.filter((r) => r.technologyId === technologyId).map(toSkillProgress),
    };
  }

  async next(user: UserInfo, skillId: string): Promise<NextQuestionResponse> {
    const found = this.deps.content.findSkill(skillId);
    if (!found) throw notFound('Unknown skill.');
    const mastery = await this.deps.store.getMastery(user.id, skillId);
    const skill = toSkillProgress(
      mastery ?? this.emptyRecord(user.id, skillId, found.technologyId),
    );

    // Resume an unanswered question instead of serving a new one.
    const open = await this.deps.store.findOpenToken(user.id, skillId);
    if (open) {
      const served = this.deps.content.findQuestion(open.questionId);
      if (served && served.question.version === open.questionVersion && !this.isExpired(open)) {
        return {
          token: open.id,
          question: served.question,
          skill,
          hintsRevealed: served.grading.hints.slice(0, open.hintsRevealed),
          expiresAt: open.expiresAt,
        };
      }
      // Expired, or the question changed: discard it.
      await this.deps.store.deleteToken(open.id);
    }

    const state = mastery?.state ?? initialState(this.scoring);
    const recent = await this.deps.store.listAttempts(user.id, skillId, RECENT_ATTEMPTS);
    // Without a SQL engine (e.g. a deployment without the SQL runner), SQL questions can't be graded.
    const available = this.deps.content
      .questions(skillId)
      .filter((q) => q.question.format !== 'sql-query' || this.sql[q.question.dialect]);
    if (available.length === 0)
      throw new ApiError('unavailable', 'SQL practice is not available here yet.');
    const chosen = selectQuestion(
      available,
      targetDifficulty(state, this.scoring),
      recent.map((a) => a.questionId),
      this.deps.random,
    );

    const now = this.deps.now();
    const token: QuestionToken = {
      id: this.deps.newId(),
      userId: user.id,
      skillId,
      questionId: chosen.question.id,
      questionVersion: chosen.question.version,
      issuedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + TOKEN_TTL_MS).toISOString(),
      hintsRevealed: 0,
    };
    await this.deps.store.putToken(token);
    return {
      token: token.id,
      question: chosen.question,
      skill,
      hintsRevealed: [],
      expiresAt: token.expiresAt,
    };
  }

  async hint(user: UserInfo, tokenId: string): Promise<HintResponse> {
    const token = await this.ownedToken(user, tokenId);
    if (token.attemptId) throw new ApiError('conflict', 'This question has already been answered.');
    const served = this.servedQuestion(token);
    const hints = served.grading.hints;
    if (token.hintsRevealed >= hints.length)
      throw badRequest('There are no more hints for this question.');

    const updated = await this.deps.store.revealHint(token.id, hints.length);
    const index = (updated?.hintsRevealed ?? token.hintsRevealed + 1) - 1;
    return { hint: hints[index] ?? '', index, remaining: hints.length - index - 1 };
  }

  async answer(user: UserInfo, request: AnswerRequest): Promise<AnswerResponse> {
    const token = await this.ownedToken(user, request.token);

    // Idempotent: replay the stored result instead of scoring twice.
    if (token.attemptId) {
      const attempt = await this.deps.store.getAttempt(token.attemptId);
      if (attempt) return attempt.response;
    }
    const served = this.servedQuestion(token);
    const grade = await this.grade(served, request.answer);
    const found = this.deps.content.findSkill(token.skillId);
    if (!found) throw notFound('Unknown skill.');

    for (let tries = 0; tries < MAX_CONFLICT_RETRIES; tries++) {
      const current = await this.deps.store.getMastery(user.id, token.skillId);
      const before = current ?? this.emptyRecord(user.id, token.skillId, found.technologyId);
      const outcome = applyAttempt(
        before.state,
        {
          result: grade.result,
          difficulty: served.question.difficulty,
          hintsUsed: token.hintsRevealed,
        },
        this.scoring,
      );
      const now = this.deps.now().toISOString();
      const mastery: MasteryRecord = {
        ...before,
        state: outcome.state,
        revision: before.revision + 1,
        lastPracticedAt: now,
      };
      const response: AnswerResponse = {
        result: grade.result,
        ...(grade.note ? { resultNote: grade.note } : {}),
        correctAnswer: grade.revealed,
        explanation: served.grading.explanation,
        scoreBefore: before.state.score,
        scoreAfter: outcome.state.score,
        xpAwarded: outcome.xpAwarded,
        masteredNow: outcome.masteredNow,
        ...(outcome.checkpointReached !== undefined
          ? { checkpointReached: outcome.checkpointReached }
          : {}),
        skill: toSkillProgress(mastery),
      };
      const attempt: AttemptRecord = {
        attemptId: this.deps.newId(),
        userId: user.id,
        skillId: token.skillId,
        questionId: token.questionId,
        questionVersion: token.questionVersion,
        contentVersion: this.deps.content.contentVersion,
        difficulty: served.question.difficulty,
        result: grade.result,
        hintsUsed: token.hintsRevealed,
        scoreBefore: before.state.score,
        scoreAfter: outcome.state.score,
        xpAwarded: outcome.xpAwarded,
        answeredAt: now,
        response,
      };

      const result = await this.deps.store.recordAnswer({
        tokenId: token.id,
        attempt,
        mastery,
        expectedRevision: current?.revision ?? 0,
      });
      if (result.kind === 'recorded') return response;
      if (result.kind === 'already-answered') return result.attempt.response;
      // Conflict: another answer changed mastery first. Recompute from the new state.
    }
    throw new ApiError('conflict', 'Your progress changed while answering. Please try again.');
  }

  /** "Run query": executes SQL on the sample data of the served question. Not graded or scored. */
  async runSql(user: UserInfo, request: RunSqlRequest): Promise<RunSqlResponse> {
    const token = await this.ownedToken(user, request.token);
    const served = this.servedQuestion(token);
    if (served.question.format !== 'sql-query')
      throw badRequest('This question is not a SQL question.');
    return this.sqlGrader(served.question.dialect).preview(served.question, request.query);
  }

  async history(user: UserInfo, skillId: string): Promise<HistoryResponse> {
    const found = this.deps.content.findSkill(skillId);
    if (!found) throw notFound('Unknown skill.');
    const mastery = await this.deps.store.getMastery(user.id, skillId);
    const attempts = await this.deps.store.listAttempts(user.id, skillId, HISTORY_LIMIT);
    return {
      skill: toSkillProgress(mastery ?? this.emptyRecord(user.id, skillId, found.technologyId)),
      attempts: attempts.map(toAttemptSummary),
    };
  }

  private async grade(
    served: ReturnType<PracticeService['servedQuestion']>,
    answer: AnswerRequest['answer'],
  ) {
    const { question, grading } = served;
    if (question.format === 'sql-query' && grading.answer.format === 'sql-query') {
      if (answer.format !== 'sql-query')
        throw badRequest('This question expects a sql-query answer.');
      return this.sqlGrader(question.dialect).grade(question, grading.answer, answer.query);
    }
    return gradeAnswer(question, grading.answer, answer);
  }

  private sqlGrader(dialect: SqlDialect): SqlGrader {
    const grader = this.sql[dialect];
    if (!grader) {
      throw new ApiError(
        'unavailable',
        `${SQL_DIALECT_LABELS[dialect]} SQL practice is not available here yet.`,
      );
    }
    return grader;
  }

  /** A token that exists, belongs to this user and has not expired. */
  private async ownedToken(user: UserInfo, tokenId: string): Promise<QuestionToken> {
    const token = await this.deps.store.getToken(tokenId);
    // Someone else's token is reported as missing, not as forbidden.
    if (!token || token.userId !== user.id) throw notFound('Unknown question token.');
    if (!token.attemptId && this.isExpired(token)) {
      throw new ApiError('token-expired', 'This question has expired. Load a new one to continue.');
    }
    return token;
  }

  private servedQuestion(token: QuestionToken) {
    const served = this.deps.content.findQuestion(token.questionId);
    if (!served || served.question.version !== token.questionVersion) {
      throw new ApiError('conflict', 'This question was updated. Load a new one to continue.');
    }
    return served;
  }

  private isExpired(token: QuestionToken): boolean {
    return new Date(token.expiresAt).getTime() <= this.deps.now().getTime();
  }

  private emptyRecord(userId: string, skillId: string, technologyId: string): MasteryRecord {
    return {
      userId,
      skillId,
      technologyId,
      state: initialState(this.scoring),
      revision: 0,
      lastPracticedAt: '',
    };
  }
}

function toSkillProgress(record: MasteryRecord): SkillProgress {
  const state: MasteryState = record.state;
  return {
    skillId: record.skillId,
    score: state.score,
    mastered: state.mastered,
    attempts: state.attempts,
    ...(record.lastPracticedAt ? { lastPracticedAt: record.lastPracticedAt } : {}),
  };
}

function toAttemptSummary(a: AttemptRecord): AttemptSummary {
  return {
    attemptId: a.attemptId,
    questionId: a.questionId,
    difficulty: a.difficulty,
    result: a.result,
    hintsUsed: a.hintsUsed,
    scoreBefore: a.scoreBefore,
    scoreAfter: a.scoreAfter,
    xpAwarded: a.xpAwarded,
    answeredAt: a.answeredAt,
  };
}
