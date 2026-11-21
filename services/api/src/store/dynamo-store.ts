import {
  ConditionalCheckFailedException,
  DynamoDBClient,
  TransactionCanceledException,
} from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
  TransactWriteCommand,
  UpdateCommand,
  DeleteCommand,
} from '@aws-sdk/lib-dynamodb';
import type { LanguageId } from '@pracstack/content-model';
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

/*
 * DynamoDB single-table layout (partition key `pk`, sort key `sk`, TTL `ttl`):
 *
 *   pk              sk                                       item
 *   USER#<user>     PROFILE                                  { xp }
 *   USER#<user>     MASTERY#<skill>                          { revision, data: MasteryRecord }
 *   USER#<user>     OPEN#<skill>                             { tokenId }  newest token for a skill
 *   USER#<user>     ATTEMPT#<skill>#<answeredAt>#<attempt>   { data: AttemptRecord }  (history)
 *   USER#<user>     SUB#<challenge>#<submittedAt>#<id>       { data: SubmissionRecord }
 *   USER#<user>     CHALLENGE#<challenge>                    progress fields
 *   TOKEN#<token>   TOKEN                                    token fields (expires via TTL)
 *   ATTEMPT#<id>    ATTEMPT                                  { data: AttemptRecord }  (lookup by id)
 *
 * Everything a user owns lives in their partition, so every list is a single
 * Query. Answers and submissions are DynamoDB transactions, so a token can
 * never be scored twice and mastery updates use optimistic concurrency.
 */

const user = (userId: string) => `USER#${userId}`;
const DAY_S = 24 * 60 * 60;

export interface DynamoStoreOptions {
  readonly tableName: string;
  readonly client?: DynamoDBClient;
}

export function documentClient(client: DynamoDBClient): DynamoDBDocumentClient {
  return DynamoDBDocumentClient.from(client, {
    marshallOptions: { removeUndefinedValues: true },
  });
}

export class DynamoProgressStore implements ProgressStore {
  private readonly db: DynamoDBDocumentClient;
  private readonly table: string;

  constructor(options: DynamoStoreOptions) {
    this.table = options.tableName;
    this.db = documentClient(options.client ?? new DynamoDBClient({}));
  }

  // ---- mastery and XP ----

  async getMastery(userId: string, skillId: string): Promise<MasteryRecord | undefined> {
    const item = await this.get(user(userId), `MASTERY#${skillId}`);
    return item?.['data'] as MasteryRecord | undefined;
  }

  async listMastery(userId: string): Promise<readonly MasteryRecord[]> {
    const items = await this.query(user(userId), 'MASTERY#');
    return items.map((i) => i['data'] as MasteryRecord);
  }

  async getXp(userId: string): Promise<number> {
    const item = await this.get(user(userId), 'PROFILE');
    return typeof item?.['xp'] === 'number' ? item['xp'] : 0;
  }

  // ---- question tokens ----

  async putToken(token: QuestionToken): Promise<void> {
    await this.db.send(
      new TransactWriteCommand({
        TransactItems: [
          { Put: { TableName: this.table, Item: tokenItem(token) } },
          {
            Put: {
              TableName: this.table,
              Item: { pk: user(token.userId), sk: `OPEN#${token.skillId}`, tokenId: token.id },
            },
          },
        ],
      }),
    );
  }

  async getToken(tokenId: string): Promise<QuestionToken | undefined> {
    const item = await this.get(`TOKEN#${tokenId}`, 'TOKEN');
    return item ? fromTokenItem(item) : undefined;
  }

  async findOpenToken(userId: string, skillId: string): Promise<QuestionToken | undefined> {
    const pointer = await this.get(user(userId), `OPEN#${skillId}`);
    const tokenId = pointer?.['tokenId'];
    if (typeof tokenId !== 'string') return undefined;
    const token = await this.getToken(tokenId);
    return token && !token.attemptId ? token : undefined;
  }

  async revealHint(tokenId: string, maxHints: number): Promise<QuestionToken | undefined> {
    try {
      const res = await this.db.send(
        new UpdateCommand({
          TableName: this.table,
          Key: { pk: `TOKEN#${tokenId}`, sk: 'TOKEN' },
          UpdateExpression: 'SET hintsRevealed = hintsRevealed + :one',
          ConditionExpression:
            'attribute_exists(pk) AND attribute_not_exists(attemptId) AND hintsRevealed < :max',
          ExpressionAttributeValues: { ':one': 1, ':max': maxHints },
          ReturnValues: 'ALL_NEW',
        }),
      );
      return res.Attributes ? fromTokenItem(res.Attributes) : undefined;
    } catch (err) {
      if (err instanceof ConditionalCheckFailedException) return this.getToken(tokenId);
      throw err;
    }
  }

  async deleteToken(tokenId: string): Promise<void> {
    await this.db.send(
      new DeleteCommand({ TableName: this.table, Key: { pk: `TOKEN#${tokenId}`, sk: 'TOKEN' } }),
    );
  }

  // ---- attempts ----

  async getAttempt(attemptId: string): Promise<AttemptRecord | undefined> {
    const item = await this.get(`ATTEMPT#${attemptId}`, 'ATTEMPT');
    return item?.['data'] as AttemptRecord | undefined;
  }

  async listAttempts(
    userId: string,
    skillId: string,
    limit: number,
  ): Promise<readonly AttemptRecord[]> {
    const items = await this.query(user(userId), `ATTEMPT#${skillId}#`, limit);
    return items.map((i) => i['data'] as AttemptRecord);
  }

  async recordAnswer(input: RecordAnswer): Promise<RecordAnswerOutcome> {
    const { attempt, mastery } = input;
    try {
      await this.db.send(
        new TransactWriteCommand({
          TransactItems: [
            {
              // 0: the token, only if not answered yet.
              Update: {
                TableName: this.table,
                Key: { pk: `TOKEN#${input.tokenId}`, sk: 'TOKEN' },
                UpdateExpression: 'SET attemptId = :attempt',
                ConditionExpression: 'attribute_exists(pk) AND attribute_not_exists(attemptId)',
                ExpressionAttributeValues: { ':attempt': attempt.attemptId },
              },
            },
            {
              // 1: mastery, only if unchanged since it was read.
              Put: {
                TableName: this.table,
                Item: {
                  pk: user(mastery.userId),
                  sk: `MASTERY#${mastery.skillId}`,
                  revision: mastery.revision,
                  data: mastery,
                },
                ...(input.expectedRevision === 0
                  ? { ConditionExpression: 'attribute_not_exists(pk)' }
                  : {
                      ConditionExpression: 'revision = :expected',
                      ExpressionAttributeValues: { ':expected': input.expectedRevision },
                    }),
              },
            },
            {
              Update: {
                TableName: this.table,
                Key: { pk: user(attempt.userId), sk: 'PROFILE' },
                UpdateExpression: 'ADD xp :xp',
                ExpressionAttributeValues: { ':xp': attempt.xpAwarded },
              },
            },
            {
              Put: {
                TableName: this.table,
                Item: { pk: `ATTEMPT#${attempt.attemptId}`, sk: 'ATTEMPT', data: attempt },
              },
            },
            {
              Put: {
                TableName: this.table,
                Item: {
                  pk: user(attempt.userId),
                  sk: `ATTEMPT#${attempt.skillId}#${attempt.answeredAt}#${attempt.attemptId}`,
                  data: attempt,
                },
              },
            },
          ],
        }),
      );
      return { kind: 'recorded' };
    } catch (err) {
      if (!(err instanceof TransactionCanceledException)) throw err;
      const tokenFailed = err.CancellationReasons?.[0]?.Code === 'ConditionalCheckFailed';
      if (tokenFailed) {
        const token = await this.getToken(input.tokenId);
        const existing = token?.attemptId ? await this.getAttempt(token.attemptId) : undefined;
        if (existing) return { kind: 'already-answered', attempt: existing };
      }
      // Mastery changed, or a concurrent transaction touched the same items: recompute.
      return { kind: 'conflict' };
    }
  }

  // ---- coding-challenge submissions ----

  async recordSubmission(submission: SubmissionRecord): Promise<ChallengeProgressRecord> {
    const accepted = submission.status === 'accepted';
    const key = { pk: user(submission.userId), sk: `CHALLENGE#${submission.challengeId}` };
    await this.db.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Put: {
              TableName: this.table,
              Item: {
                pk: user(submission.userId),
                sk: `SUB#${submission.challengeId}#${submission.submittedAt}#${submission.id}`,
                data: submission,
              },
              ConditionExpression: 'attribute_not_exists(pk)',
            },
          },
          {
            Update: {
              TableName: this.table,
              Key: key,
              // "solved" is sticky: once true it is never set back to false.
              UpdateExpression: accepted
                ? 'SET userId = :u, challengeId = :c, lastSubmittedAt = :t, solved = :true, solvedAt = if_not_exists(solvedAt, :t) ADD attempts :one, languagesSolved :lang'
                : 'SET userId = :u, challengeId = :c, lastSubmittedAt = :t, solved = if_not_exists(solved, :false) ADD attempts :one',
              ExpressionAttributeValues: {
                ':u': submission.userId,
                ':c': submission.challengeId,
                ':t': submission.submittedAt,
                ':one': 1,
                ...(accepted
                  ? { ':true': true, ':lang': new Set([submission.language]) }
                  : { ':false': false }),
              },
            },
          },
        ],
      }),
    );
    const item = await this.get(key.pk, key.sk);
    if (!item) throw new Error('Challenge progress missing after a write.');
    return fromProgressItem(item);
  }

  async listSubmissions(
    userId: string,
    challengeId: string,
    limit: number,
  ): Promise<readonly SubmissionRecord[]> {
    const items = await this.query(user(userId), `SUB#${challengeId}#`, limit);
    return items.map((i) => i['data'] as SubmissionRecord);
  }

  async listChallengeProgress(userId: string): Promise<readonly ChallengeProgressRecord[]> {
    const items = await this.query(user(userId), 'CHALLENGE#');
    return items.map(fromProgressItem);
  }

  // ---- helpers ----

  private async get(pk: string, sk: string): Promise<Record<string, unknown> | undefined> {
    const res = await this.db.send(
      new GetCommand({ TableName: this.table, Key: { pk, sk }, ConsistentRead: true }),
    );
    return res.Item;
  }

  /** Items whose sort key starts with `prefix`, newest (highest key) first. */
  private async query(
    pk: string,
    prefix: string,
    limit?: number,
  ): Promise<Record<string, unknown>[]> {
    const items: Record<string, unknown>[] = [];
    let start: Record<string, unknown> | undefined;
    do {
      const res = await this.db.send(
        new QueryCommand({
          TableName: this.table,
          KeyConditionExpression: 'pk = :pk AND begins_with(sk, :prefix)',
          ExpressionAttributeValues: { ':pk': pk, ':prefix': prefix },
          ScanIndexForward: false,
          ConsistentRead: true,
          ...(limit !== undefined ? { Limit: limit - items.length } : {}),
          ...(start ? { ExclusiveStartKey: start } : {}),
        }),
      );
      items.push(...(res.Items ?? []));
      start = res.LastEvaluatedKey;
    } while (start && (limit === undefined || items.length < limit));
    return items;
  }
}

function tokenItem(token: QuestionToken): Record<string, unknown> {
  return {
    pk: `TOKEN#${token.id}`,
    sk: 'TOKEN',
    ...token,
    // Removed by DynamoDB a day after it expires (the API rejects it from expiry on).
    ttl: Math.floor(Date.parse(token.expiresAt) / 1000) + DAY_S,
  };
}

function fromTokenItem(item: Record<string, unknown>): QuestionToken {
  const { pk, sk, ttl, ...token } = item;
  void pk;
  void sk;
  void ttl;
  return token as unknown as QuestionToken;
}

function fromProgressItem(item: Record<string, unknown>): ChallengeProgressRecord {
  const languages = item['languagesSolved'];
  return {
    userId: String(item['userId']),
    challengeId: String(item['challengeId']),
    solved: item['solved'] === true,
    ...(typeof item['solvedAt'] === 'string' ? { solvedAt: item['solvedAt'] } : {}),
    attempts: Number(item['attempts'] ?? 0),
    lastSubmittedAt: String(item['lastSubmittedAt']),
    languagesSolved: languages instanceof Set ? ([...languages] as LanguageId[]).sort() : [],
  };
}
