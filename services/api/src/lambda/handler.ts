/**
 * AWS Lambda entry point (bundled by scripts/build-lambda.ts).
 *
 * Runs only the API logic: progress, scoring and question serving. It never
 * executes learner code or SQL; without a SQL engine or code runner those
 * requests return 503 until the isolated runners exist on AWS (Phase 7).
 */
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createApi } from '../app';
import { VerifiedJwtAuthenticator } from '../auth';
import { loadContentSource } from '../content/content-source';
import { DynamoRateLimiter } from '../store/dynamo-rate-limit';
import { DynamoProgressStore } from '../store/dynamo-store';
import { createLambdaHandler } from './adapter';

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable ${name}.`);
  return value;
}

const tableName = env('TABLE_NAME');
const limiter = (name: string, limit: number) =>
  new DynamoRateLimiter({ tableName, name, limit, windowMs: 60_000 });

const api = createApi({
  auth: new VerifiedJwtAuthenticator({
    issuer: env('JWT_ISSUER'),
    audience: env('JWT_AUDIENCE'),
  }),
  // Content (public and private) is bundled next to this file at build time.
  content: loadContentSource(fileURLToPath(new URL('./content', import.meta.url))),
  store: new DynamoProgressStore({ tableName }),
  rateLimiter: limiter('api', 120),
  sqlRateLimiter: limiter('sql', 30),
  codeRateLimiter: limiter('code', 10),
  now: () => new Date(),
  random: Math.random,
  newId: randomUUID,
  logError: (err) => {
    // Structured, and never includes request bodies (which may contain learner code).
    console.error(
      JSON.stringify({
        level: 'error',
        message: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      }),
    );
  },
});

export const handler = createLambdaHandler(api);
