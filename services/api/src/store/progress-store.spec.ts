import type { AnswerResponse } from '@pracstack/api-contracts';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { type DynamoDbLocal, skipDockerTests, startDynamoDbLocal } from '../testing/dynamodb-local';
import { DynamoRateLimiter } from './dynamo-rate-limit';
import { DynamoProgressStore } from './dynamo-store';
import { InMemoryProgressStore } from './memory-store';
import type {
  AttemptRecord,
  MasteryRecord,
  ProgressStore,
  QuestionToken,
  SubmissionRecord,
} from './progress-store';

/*
 * One behavioural contract, run against every store: the in-memory store used
 * locally and the DynamoDB store used on AWS (against DynamoDB Local).
 */

const token = (id: string, over: Partial<QuestionToken> = {}): QuestionToken => ({
  id,
  userId: 'alice',
  skillId: 'ts-basics',
  questionId: 'q1',
  questionVersion: 1,
  issuedAt: '2026-11-21T12:00:00.000Z',
  expiresAt: '2026-11-21T12:30:00.000Z',
  hintsRevealed: 0,
  ...over,
});

const mastery = (revision: number, score: number): MasteryRecord => ({
  userId: 'alice',
  skillId: 'ts-basics',
  technologyId: 'typescript',
  state: {
    score,
    attempts: revision,
    correctStreak: 1,
    masteryStreak: 0,
    tier: 1,
    tierCorrect: 0,
    tierMisses: 0,
    checkpoint: 0,
    mastered: false,
    configVersion: 1,
  },
  revision,
  lastPracticedAt: '2026-11-21T12:01:00.000Z',
});

const attempt = (attemptId: string, answeredAt: string, xp = 5): AttemptRecord => ({
  attemptId,
  userId: 'alice',
  skillId: 'ts-basics',
  questionId: 'q1',
  questionVersion: 1,
  contentVersion: 'c1',
  difficulty: 2,
  result: 'correct',
  hintsUsed: 0,
  scoreBefore: 0,
  scoreAfter: 10,
  xpAwarded: xp,
  answeredAt,
  response: { result: 'correct', attemptId } as unknown as AnswerResponse,
});

const submission = (
  id: string,
  submittedAt: string,
  over: Partial<SubmissionRecord> = {},
): SubmissionRecord => ({
  id,
  userId: 'alice',
  challengeId: 'pangram',
  challengeVersion: 1,
  language: 'typescript',
  status: 'failed',
  visiblePassed: 1,
  visibleTotal: 2,
  hiddenPassed: 0,
  hiddenTotal: 2,
  durationMs: 10,
  submittedAt,
  code: 'export const x = 1;',
  ...over,
});

function storeContract(name: string, create: () => Promise<ProgressStore>) {
  describe(name, () => {
    let store: ProgressStore;
    beforeEach(async () => {
      store = await create();
    });

    it('starts empty', async () => {
      expect(await store.getMastery('alice', 'ts-basics')).toBeUndefined();
      expect(await store.listMastery('alice')).toEqual([]);
      expect(await store.getXp('alice')).toBe(0);
      expect(await store.listChallengeProgress('alice')).toEqual([]);
    });

    it('stores tokens, finds the open one, and reveals hints up to the maximum', async () => {
      await store.putToken(token('t1'));
      expect(await store.getToken('t1')).toEqual(token('t1'));
      expect(await store.findOpenToken('alice', 'ts-basics')).toEqual(token('t1'));
      expect(await store.findOpenToken('bob', 'ts-basics')).toBeUndefined();

      expect((await store.revealHint('t1', 2))?.hintsRevealed).toBe(1);
      expect((await store.revealHint('t1', 2))?.hintsRevealed).toBe(2);
      expect((await store.revealHint('t1', 2))?.hintsRevealed).toBe(2);
      expect(await store.revealHint('missing', 2)).toBeUndefined();

      await store.deleteToken('t1');
      expect(await store.getToken('t1')).toBeUndefined();
      expect(await store.findOpenToken('alice', 'ts-basics')).toBeUndefined();
    });

    it('records an answer atomically, exactly once', async () => {
      await store.putToken(token('t1'));
      const a1 = attempt('a1', '2026-11-21T12:01:00.000Z', 7);
      const input = { tokenId: 't1', attempt: a1, mastery: mastery(1, 10), expectedRevision: 0 };
      expect(await store.recordAnswer(input)).toEqual({ kind: 'recorded' });

      expect(await store.getMastery('alice', 'ts-basics')).toEqual(mastery(1, 10));
      expect(await store.getXp('alice')).toBe(7);
      expect(await store.getAttempt('a1')).toEqual(a1);
      expect((await store.getToken('t1'))?.attemptId).toBe('a1');
      expect(await store.findOpenToken('alice', 'ts-basics')).toBeUndefined();

      // The same token again replays the stored attempt; nothing is scored twice.
      const again = await store.recordAnswer({
        ...input,
        attempt: attempt('a2', '2026-11-21T12:02:00.000Z'),
        mastery: mastery(2, 20),
        expectedRevision: 1,
      });
      expect(again).toEqual({ kind: 'already-answered', attempt: a1 });
      expect(await store.getXp('alice')).toBe(7);
      expect(await store.getAttempt('a2')).toBeUndefined();
    });

    it('rejects an answer computed from stale mastery', async () => {
      await store.putToken(token('t1'));
      await store.putToken(token('t2'));
      await store.recordAnswer({
        tokenId: 't1',
        attempt: attempt('a1', '2026-11-21T12:01:00.000Z'),
        mastery: mastery(1, 10),
        expectedRevision: 0,
      });
      const stale = await store.recordAnswer({
        tokenId: 't2',
        attempt: attempt('a2', '2026-11-21T12:02:00.000Z'),
        mastery: mastery(1, 50),
        expectedRevision: 0,
      });
      expect(stale).toEqual({ kind: 'conflict' });
      expect((await store.getMastery('alice', 'ts-basics'))?.state.score).toBe(10);
      expect(await store.getAttempt('a2')).toBeUndefined();
      expect((await store.getToken('t2'))?.attemptId).toBeUndefined();
    });

    it('lists attempts newest first, with a limit', async () => {
      const times = [
        '2026-11-21T12:01:00.000Z',
        '2026-11-21T12:03:00.000Z',
        '2026-11-21T12:02:00.000Z',
      ];
      for (const [i, at] of times.entries()) {
        await store.putToken(token(`t${i}`));
        await store.recordAnswer({
          tokenId: `t${i}`,
          attempt: attempt(`a${i}`, at),
          mastery: mastery(i + 1, i * 10),
          expectedRevision: i,
        });
      }
      const ids = (await store.listAttempts('alice', 'ts-basics', 2)).map((a) => a.attemptId);
      expect(ids).toEqual(['a1', 'a2']);
      expect(await store.listAttempts('alice', 'other-skill', 5)).toEqual([]);
      expect(await store.listMastery('alice')).toHaveLength(1);
      expect(await store.getXp('alice')).toBe(15);
    });

    it('records submissions; "solved" is sticky and remembers the first solve', async () => {
      const first = await store.recordSubmission(submission('s1', '2026-11-21T12:00:00.000Z'));
      expect(first).toMatchObject({ solved: false, attempts: 1, languagesSolved: [] });
      expect(first.solvedAt).toBeUndefined();

      const solved = await store.recordSubmission(
        submission('s2', '2026-11-21T12:05:00.000Z', { status: 'accepted', language: 'java' }),
      );
      expect(solved).toMatchObject({
        solved: true,
        solvedAt: '2026-11-21T12:05:00.000Z',
        attempts: 2,
        languagesSolved: ['java'],
      });

      const later = await store.recordSubmission(
        submission('s3', '2026-11-21T12:09:00.000Z', { status: 'compile-error' }),
      );
      expect(later).toMatchObject({
        solved: true,
        solvedAt: '2026-11-21T12:05:00.000Z',
        attempts: 3,
        lastSubmittedAt: '2026-11-21T12:09:00.000Z',
      });
      const both = await store.recordSubmission(
        submission('s4', '2026-11-21T12:10:00.000Z', { status: 'accepted' }),
      );
      expect([...both.languagesSolved].sort()).toEqual(['java', 'typescript']);

      const listed = await store.listSubmissions('alice', 'pangram', 2);
      expect(listed.map((s) => s.id)).toEqual(['s4', 's3']);
      expect(listed[0]?.code).toBe('export const x = 1;');
      expect(await store.listSubmissions('alice', 'other', 5)).toEqual([]);
      expect(await store.listChallengeProgress('alice')).toHaveLength(1);
    });

    it('keeps users apart', async () => {
      await store.recordSubmission(submission('s1', '2026-11-21T12:00:00.000Z'));
      expect(await store.listChallengeProgress('bob')).toEqual([]);
      expect(await store.listSubmissions('bob', 'pangram', 5)).toEqual([]);
    });
  });
}

storeContract('InMemoryProgressStore', () => Promise.resolve(new InMemoryProgressStore()));

describe.skipIf(skipDockerTests)('DynamoDB (DynamoDB Local in Docker)', { timeout: 60_000 }, () => {
  let local: DynamoDbLocal;
  beforeAll(async () => {
    local = await startDynamoDbLocal();
  }, 120_000);
  afterAll(async () => {
    await local?.stop();
  });

  storeContract('DynamoProgressStore', async () => {
    return new DynamoProgressStore({ tableName: await local.createTable(), client: local.client });
  });

  it('DynamoRateLimiter: a shared per-key counter per window', async () => {
    const tableName = await local.createTable();
    const limiter = (name: string) =>
      new DynamoRateLimiter({ tableName, name, limit: 2, windowMs: 60_000, client: local.client });
    const api = limiter('api');
    const t0 = 120_000 + 10_000;
    expect(await api.hit('alice', t0)).toBe(0);
    // A second instance (another Lambda) shares the same counter.
    expect(await limiter('api').hit('alice', t0 + 1)).toBe(0);
    expect(await api.hit('alice', t0 + 2)).toBe(60_000 - 10_002);
    // Other users and other limiters are separate.
    expect(await api.hit('bob', t0)).toBe(0);
    expect(await limiter('code').hit('alice', t0)).toBe(0);
    // The next window starts fresh.
    expect(await api.hit('alice', 180_000)).toBe(0);
  });
});
