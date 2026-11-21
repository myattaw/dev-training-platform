import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { type DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import type { RateLimiter } from '../rate-limit';
import { documentClient } from './dynamo-store';

export interface DynamoRateLimiterOptions {
  readonly tableName: string;
  /** Distinguishes limiters sharing a table, e.g. `api`, `sql`, `code`. */
  readonly name: string;
  readonly limit: number;
  readonly windowMs: number;
  readonly client?: DynamoDBClient;
}

/**
 * Fixed-window rate limiter shared by every Lambda instance: one atomic
 * counter per key and window (`pk = RATE#<name>#<key>`, `sk = <window start>`),
 * removed by TTL. A fixed window can admit up to twice the limit across a
 * window boundary; API Gateway throttling caps the overall request rate.
 */
export class DynamoRateLimiter implements RateLimiter {
  private readonly db: DynamoDBDocumentClient;

  constructor(private readonly options: DynamoRateLimiterOptions) {
    this.db = documentClient(options.client ?? new DynamoDBClient({}));
  }

  async hit(key: string, nowMs: number): Promise<number> {
    const { windowMs, limit, name, tableName } = this.options;
    const windowStart = Math.floor(nowMs / windowMs) * windowMs;
    const res = await this.db.send(
      new UpdateCommand({
        TableName: tableName,
        Key: { pk: `RATE#${name}#${key}`, sk: String(windowStart) },
        UpdateExpression: 'ADD hits :one SET #ttl = if_not_exists(#ttl, :ttl)',
        ExpressionAttributeNames: { '#ttl': 'ttl' },
        ExpressionAttributeValues: {
          ':one': 1,
          ':ttl': Math.ceil((windowStart + 2 * windowMs) / 1000),
        },
        ReturnValues: 'UPDATED_NEW',
      }),
    );
    const hits = Number(res.Attributes?.['hits'] ?? 0);
    return hits > limit ? windowStart + windowMs - nowMs : 0;
  }
}
