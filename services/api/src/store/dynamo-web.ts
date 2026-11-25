import { ConditionalCheckFailedException, DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DeleteCommand,
  type DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { documentClient } from './dynamo-store';
import {
  nextWebProgress,
  type WebDraftRecord,
  type WebProgressRecord,
  type WebStore,
  type WebSubmissionRecord,
  type WebTimedSessionRecord,
} from './web-store';

/*
 * Web Development Challenges in the same single table (see dynamo-store.ts):
 *
 *   pk           sk                                           item
 *   USER#<user>  WEBSUB#<challenge>#<submittedAt>#<id>        { data: WebSubmissionRecord }
 *   USER#<user>  WEBCH#<challenge>                            { revision, data: WebProgressRecord }
 *   USER#<user>  WEBDRAFT#<challenge>#<framework>             { data: WebDraftRecord }
 *   USER#<user>  WEBUSAGE#<day>                               { used } (expires via TTL)
 *   USER#<user>  WEBTIMED#<startedAt>#<id>                    { revision, data: WebTimedSessionRecord }
 *   USER#<user>  WEBTIMEDID#<id>                              { sk of the session item }
 *
 * Every item lives in its owner's partition: no query can cross users.
 */

const user = (userId: string) => `USER#${userId}`;
const DAY_S = 24 * 60 * 60;

export class DynamoWebStore implements WebStore {
  private readonly db: DynamoDBDocumentClient;
  private readonly table: string;

  constructor(options: { readonly tableName: string; readonly client?: DynamoDBClient }) {
    this.db = documentClient(options.client ?? new DynamoDBClient({}));
    this.table = options.tableName;
  }

  async recordWebSubmission(submission: WebSubmissionRecord): Promise<WebProgressRecord> {
    await this.db.send(
      new PutCommand({
        TableName: this.table,
        Item: {
          pk: user(submission.userId),
          sk: `WEBSUB#${submission.challengeId}#${submission.submittedAt}#${submission.id}`,
          data: submission,
        },
        ConditionExpression: 'attribute_not_exists(pk)',
      }),
    );
    // Progress: read, compute, write conditionally on the revision; retry on a race.
    for (let attempt = 0; attempt < 5; attempt++) {
      const key = { pk: user(submission.userId), sk: `WEBCH#${submission.challengeId}` };
      const current = await this.get(key.pk, key.sk);
      const revision = typeof current?.['revision'] === 'number' ? current['revision'] : 0;
      const next = nextWebProgress(current?.['data'] as WebProgressRecord | undefined, submission);
      try {
        await this.db.send(
          new PutCommand({
            TableName: this.table,
            Item: { ...key, revision: revision + 1, data: next },
            ConditionExpression:
              revision === 0 ? 'attribute_not_exists(pk)' : 'revision = :revision',
            ...(revision === 0 ? {} : { ExpressionAttributeValues: { ':revision': revision } }),
          }),
        );
        return next;
      } catch (err) {
        if (!(err instanceof ConditionalCheckFailedException)) throw err;
      }
    }
    throw new Error('Could not update web challenge progress (too much contention).');
  }

  async listWebSubmissions(
    userId: string,
    challengeId: string,
    limit: number,
  ): Promise<readonly WebSubmissionRecord[]> {
    const items = await this.query(user(userId), `WEBSUB#${challengeId}#`, limit);
    return items.map((i) => i['data'] as WebSubmissionRecord);
  }

  async listWebProgress(userId: string): Promise<readonly WebProgressRecord[]> {
    const items = await this.query(user(userId), 'WEBCH#');
    return items.map((i) => i['data'] as WebProgressRecord);
  }

  async getWebDraft(userId: string, challengeId: string, framework: string) {
    const item = await this.get(user(userId), `WEBDRAFT#${challengeId}#${framework}`);
    return item?.['data'] as WebDraftRecord | undefined;
  }

  async putWebDraft(draft: WebDraftRecord): Promise<void> {
    await this.db.send(
      new PutCommand({
        TableName: this.table,
        Item: {
          pk: user(draft.userId),
          sk: `WEBDRAFT#${draft.challengeId}#${draft.framework}`,
          data: draft,
        },
      }),
    );
  }

  async deleteWebDraft(userId: string, challengeId: string, framework: string): Promise<void> {
    await this.db.send(
      new DeleteCommand({
        TableName: this.table,
        Key: { pk: user(userId), sk: `WEBDRAFT#${challengeId}#${framework}` },
      }),
    );
  }

  async consumeWebExecution(userId: string, day: string, limit: number) {
    try {
      const res = await this.db.send(
        new UpdateCommand({
          TableName: this.table,
          Key: { pk: user(userId), sk: `WEBUSAGE#${day}` },
          UpdateExpression: 'ADD used :one SET #ttl = if_not_exists(#ttl, :ttl)',
          ConditionExpression: 'attribute_not_exists(used) OR used < :limit',
          ExpressionAttributeNames: { '#ttl': 'ttl' },
          ExpressionAttributeValues: {
            ':one': 1,
            ':limit': limit,
            ':ttl': Math.floor(Date.parse(`${day}T00:00:00Z`) / 1000) + 3 * DAY_S,
          },
          ReturnValues: 'UPDATED_NEW',
        }),
      );
      return { allowed: true, used: Number(res.Attributes?.['used'] ?? 1) };
    } catch (err) {
      if (err instanceof ConditionalCheckFailedException) {
        return { allowed: false, used: await this.getWebExecutions(userId, day) };
      }
      throw err;
    }
  }

  async getWebExecutions(userId: string, day: string): Promise<number> {
    const item = await this.get(user(userId), `WEBUSAGE#${day}`);
    return Number(item?.['used'] ?? 0);
  }

  async createWebTimedSession(session: WebTimedSessionRecord): Promise<void> {
    const sk = `WEBTIMED#${session.startedAt}#${session.id}`;
    await this.db.send(
      new PutCommand({
        TableName: this.table,
        Item: { pk: user(session.userId), sk, revision: 1, data: { ...session, revision: 1 } },
        ConditionExpression: 'attribute_not_exists(pk)',
      }),
    );
    await this.db.send(
      new PutCommand({
        TableName: this.table,
        Item: { pk: user(session.userId), sk: `WEBTIMEDID#${session.id}`, ref: sk },
      }),
    );
  }

  async getWebTimedSession(userId: string, id: string) {
    const ref = await this.get(user(userId), `WEBTIMEDID#${id}`);
    if (typeof ref?.['ref'] !== 'string') return undefined;
    const item = await this.get(user(userId), ref['ref']);
    return item?.['data'] as WebTimedSessionRecord | undefined;
  }

  async updateWebTimedSession(session: WebTimedSessionRecord, expectedRevision: number) {
    try {
      await this.db.send(
        new PutCommand({
          TableName: this.table,
          Item: {
            pk: user(session.userId),
            sk: `WEBTIMED#${session.startedAt}#${session.id}`,
            revision: expectedRevision + 1,
            data: { ...session, revision: expectedRevision + 1 },
          },
          ConditionExpression: 'revision = :revision',
          ExpressionAttributeValues: { ':revision': expectedRevision },
        }),
      );
      return true;
    } catch (err) {
      if (err instanceof ConditionalCheckFailedException) return false;
      throw err;
    }
  }

  async listWebTimedSessions(userId: string): Promise<readonly WebTimedSessionRecord[]> {
    const items = await this.query(user(userId), 'WEBTIMED#', 50);
    return items.map((i) => i['data'] as WebTimedSessionRecord);
  }

  private async get(pk: string, sk: string): Promise<Record<string, unknown> | undefined> {
    const res = await this.db.send(
      new GetCommand({ TableName: this.table, Key: { pk, sk }, ConsistentRead: true }),
    );
    return res.Item;
  }

  /** Items whose sort key starts with `prefix`, newest (highest key) first. */
  private async query(pk: string, prefix: string, limit?: number) {
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
