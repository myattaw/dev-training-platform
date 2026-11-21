import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { APIGatewayProxyEventV2WithJWTAuthorizer } from 'aws-lambda';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildLambda } from '../../scripts/build-lambda';
import { type DynamoDbLocal, skipDockerTests, startDynamoDbLocal } from '../testing/dynamodb-local';

/*
 * Builds the real Lambda bundle and invokes it the way AWS would, with the
 * DynamoDB store pointed at DynamoDB Local. Catches bundling problems
 * (missing files, ESM/CJS issues) that unit tests of the source can't.
 */

const ISSUER = 'https://cognito-idp.us-east-2.amazonaws.com/us-east-2_SMOKE';
const CLIENT = 'smoke-client';

type Handler = (
  e: APIGatewayProxyEventV2WithJWTAuthorizer,
) => Promise<{ statusCode: number; body: string }>;

const event = (method: string, path: string, body?: unknown) =>
  ({
    version: '2.0',
    rawPath: path,
    rawQueryString: '',
    headers: {},
    isBase64Encoded: false,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    requestContext: {
      http: { method, path },
      authorizer: {
        jwt: {
          claims: {
            sub: 'smoke-user',
            iss: ISSUER,
            aud: CLIENT,
            token_use: 'id',
            email: 'smoke@example.com',
            exp: String(Math.floor(Date.now() / 1000) + 600),
          },
          scopes: [],
        },
      },
    },
  }) as unknown as APIGatewayProxyEventV2WithJWTAuthorizer;

/** A syntactically valid (usually wrong) answer for a question format. */
const anyAnswer = (format: string) =>
  format === 'multiple-choice'
    ? { format, selected: ['a'] }
    : format === 'predict-output'
      ? { format, output: '?' }
      : { format, blanks: {} };

describe.skipIf(skipDockerTests)('the built Lambda bundle', { timeout: 120_000 }, () => {
  let local: DynamoDbLocal;
  let handler: Handler;
  const outDir = mkdtempSync(join(tmpdir(), 'pracstack-lambda-'));

  beforeAll(async () => {
    local = await startDynamoDbLocal();
    const tableName = await local.createTable();
    const endpoint = await local.client.config.endpoint?.();
    Object.assign(process.env, {
      TABLE_NAME: tableName,
      JWT_ISSUER: ISSUER,
      JWT_AUDIENCE: CLIENT,
      AWS_REGION: 'local',
      AWS_ACCESS_KEY_ID: 'local',
      AWS_SECRET_ACCESS_KEY: 'local',
      AWS_ENDPOINT_URL_DYNAMODB: `http://${endpoint?.hostname}:${endpoint?.port}`,
    });
    await buildLambda(outDir);
    const mod = (await import(pathToFileURL(join(outDir, 'index.mjs')).href)) as {
      handler: Handler;
    };
    handler = mod.handler;
  }, 180_000);

  afterAll(async () => {
    await local?.stop();
    rmSync(outDir, { recursive: true, force: true });
  });

  it('serves /api/me for a signed-in user', async () => {
    const res = await handler(event('GET', '/api/me'));
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toMatchObject({ user: { id: 'smoke-user' }, xp: 0 });
  });

  it('serves and records a TypeScript practice question in DynamoDB', async () => {
    const next = await handler(
      event('POST', '/api/skill-mastery/practice/next', { skillId: 'ts-primitive-types' }),
    );
    expect(next.statusCode, next.body).toBe(200);
    const again = await handler(
      event('POST', '/api/skill-mastery/practice/next', { skillId: 'ts-primitive-types' }),
    );
    // The open question is resumed from the store, not replaced.
    expect(JSON.parse(again.body).token).toBe(JSON.parse(next.body).token);
  });

  it('never serves SQL-writing questions, and returns 503 for code submissions (no runners here)', async () => {
    // PostgreSQL skills also have multiple-choice questions; only those are served.
    for (let i = 0; i < 5; i++) {
      const sql = await handler(
        event('POST', '/api/skill-mastery/practice/next', { skillId: 'pg-select-where' }),
      );
      expect(sql.statusCode, sql.body).toBe(200);
      const served = JSON.parse(sql.body) as { token: string; question: { format: string } };
      expect(served.question.format).not.toBe('sql-query');
      // Answer it (recorded in DynamoDB) so the next request serves a fresh question.
      const answered = await handler(
        event('POST', '/api/skill-mastery/practice/answer', {
          token: served.token,
          answer: anyAnswer(served.question.format),
        }),
      );
      expect(answered.statusCode, answered.body).toBe(200);
    }
    const code = await handler(
      event('POST', '/api/challenges/pangram/submissions', {
        language: 'typescript',
        code: 'export const x = 1;',
      }),
    );
    expect(code.statusCode, code.body).toBe(503);
  });
});
