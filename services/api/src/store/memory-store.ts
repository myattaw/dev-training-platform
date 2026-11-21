import type {
  AttemptRecord,
  ChallengeProgressRecord,
  MasteryRecord,
  ProgressStore,
  QuestionToken,
  RecordAnswer,
  RecordAnswerOutcome,
  SubmissionRecord,
} from './progress-store';

/** Serializable snapshot of all store data. */
export interface StoreData {
  readonly version: 1;
  mastery: Record<string, MasteryRecord>;
  tokens: Record<string, QuestionToken>;
  attempts: Record<string, AttemptRecord>;
  xp: Record<string, number>;
  submissions: Record<string, SubmissionRecord>;
  challengeProgress: Record<string, ChallengeProgressRecord>;
}

export const emptyStoreData = (): StoreData => ({
  version: 1,
  mastery: {},
  tokens: {},
  attempts: {},
  xp: {},
  submissions: {},
  challengeProgress: {},
});

const masteryKey = (userId: string, skillId: string): string => `${userId}#${skillId}`;

/**
 * In-memory store. Each method runs synchronously inside one JavaScript turn,
 * so `recordAnswer`'s checks and writes are atomic.
 */
export class InMemoryProgressStore implements ProgressStore {
  constructor(protected data: StoreData = emptyStoreData()) {}

  /** Called after every write. The file store overrides this to save to disk. */
  protected persist(): Promise<void> {
    return Promise.resolve();
  }

  getMastery(userId: string, skillId: string): Promise<MasteryRecord | undefined> {
    return Promise.resolve(this.data.mastery[masteryKey(userId, skillId)]);
  }

  listMastery(userId: string): Promise<readonly MasteryRecord[]> {
    return Promise.resolve(Object.values(this.data.mastery).filter((m) => m.userId === userId));
  }

  getXp(userId: string): Promise<number> {
    return Promise.resolve(this.data.xp[userId] ?? 0);
  }

  putToken(token: QuestionToken): Promise<void> {
    this.data.tokens[token.id] = token;
    return this.persist();
  }

  getToken(tokenId: string): Promise<QuestionToken | undefined> {
    return Promise.resolve(this.data.tokens[tokenId]);
  }

  findOpenToken(userId: string, skillId: string): Promise<QuestionToken | undefined> {
    const open = Object.values(this.data.tokens)
      .filter((t) => t.userId === userId && t.skillId === skillId && !t.attemptId)
      .sort((a, b) => b.issuedAt.localeCompare(a.issuedAt));
    return Promise.resolve(open[0]);
  }

  async revealHint(tokenId: string, maxHints: number): Promise<QuestionToken | undefined> {
    const token = this.data.tokens[tokenId];
    if (!token || token.attemptId || token.hintsRevealed >= maxHints) return token;
    const updated = { ...token, hintsRevealed: token.hintsRevealed + 1 };
    this.data.tokens[tokenId] = updated;
    await this.persist();
    return updated;
  }

  deleteToken(tokenId: string): Promise<void> {
    delete this.data.tokens[tokenId];
    return this.persist();
  }

  getAttempt(attemptId: string): Promise<AttemptRecord | undefined> {
    return Promise.resolve(this.data.attempts[attemptId]);
  }

  listAttempts(userId: string, skillId: string, limit: number): Promise<readonly AttemptRecord[]> {
    return Promise.resolve(
      Object.values(this.data.attempts)
        .filter((a) => a.userId === userId && a.skillId === skillId)
        .sort(
          (a, b) =>
            b.answeredAt.localeCompare(a.answeredAt) || b.attemptId.localeCompare(a.attemptId),
        )
        .slice(0, limit),
    );
  }

  async recordAnswer(input: RecordAnswer): Promise<RecordAnswerOutcome> {
    const token = this.data.tokens[input.tokenId];
    if (token?.attemptId) {
      const attempt = this.data.attempts[token.attemptId];
      if (attempt) return { kind: 'already-answered', attempt };
    }
    const key = masteryKey(input.mastery.userId, input.mastery.skillId);
    const current = this.data.mastery[key]?.revision ?? 0;
    if (current !== input.expectedRevision) return { kind: 'conflict' };

    if (token) this.data.tokens[input.tokenId] = { ...token, attemptId: input.attempt.attemptId };
    this.data.attempts[input.attempt.attemptId] = input.attempt;
    this.data.mastery[key] = input.mastery;
    const userId = input.attempt.userId;
    this.data.xp[userId] = (this.data.xp[userId] ?? 0) + input.attempt.xpAwarded;
    await this.persist();
    return { kind: 'recorded' };
  }

  async recordSubmission(submission: SubmissionRecord): Promise<ChallengeProgressRecord> {
    const key = masteryKey(submission.userId, submission.challengeId);
    const before = this.data.challengeProgress[key];
    const accepted = submission.status === 'accepted';
    const languagesSolved = new Set(before?.languagesSolved ?? []);
    if (accepted) languagesSolved.add(submission.language);
    const solvedAt = before?.solvedAt ?? (accepted ? submission.submittedAt : undefined);
    const progress: ChallengeProgressRecord = {
      userId: submission.userId,
      challengeId: submission.challengeId,
      solved: Boolean(before?.solved) || accepted,
      ...(solvedAt ? { solvedAt } : {}),
      attempts: (before?.attempts ?? 0) + 1,
      lastSubmittedAt: submission.submittedAt,
      languagesSolved: [...languagesSolved],
    };
    this.data.submissions[submission.id] = submission;
    this.data.challengeProgress[key] = progress;
    await this.persist();
    return progress;
  }

  listSubmissions(
    userId: string,
    challengeId: string,
    limit: number,
  ): Promise<readonly SubmissionRecord[]> {
    return Promise.resolve(
      Object.values(this.data.submissions)
        .filter((s) => s.userId === userId && s.challengeId === challengeId)
        .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt) || b.id.localeCompare(a.id))
        .slice(0, limit),
    );
  }

  listChallengeProgress(userId: string): Promise<readonly ChallengeProgressRecord[]> {
    return Promise.resolve(
      Object.values(this.data.challengeProgress).filter((p) => p.userId === userId),
    );
  }
}
