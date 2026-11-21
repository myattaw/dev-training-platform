import { execFile } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { APIGatewayProxyEventV2WithJWTAuthorizer } from 'aws-lambda';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildLambda } from '../../scripts/build-lambda';
// The runner image build of services/runners (a test-only cross-workspace import).
import { buildContexts, buildLocalImages, localImage } from '../../../runners/scripts/build';
import { type DynamoDbLocal, skipDockerTests, startDynamoDbLocal } from '../testing/dynamodb-local';

/*
 * Builds the real Lambda bundle and invokes it the way AWS would, with the
 * DynamoDB store pointed at DynamoDB Local, and the Lambda client pointed at
 * the real TypeScript runner image running under the Lambda Runtime Interface
 * Emulator (which serves the same Invoke API). So a submission goes:
 * bundle → AWS SDK Invoke → runner container → validation → grading → DynamoDB.
 * Catches bundling and wiring problems that unit tests of the source can't.
 */
const exec = promisify(execFile);

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
  let runnerContainer = '';
  const outDir = mkdtempSync(join(tmpdir(), 'pracstack-lambda-'));

  beforeAll(async () => {
    local = await startDynamoDbLocal();
    const tableName = await local.createTable();
    const endpoint = await local.client.config.endpoint?.();
    await buildContexts();
    buildLocalImages(['typescript']);
    runnerContainer = (
      await exec('docker', [
        'run',
        '-d',
        '--rm',
        '-p',
        '127.0.0.1::8080',
        '--user',
        '993:990',
        '--read-only',
        '--tmpfs',
        '/tmp:rw,exec,size=512m',
        localImage('typescript'),
      ])
    ).stdout.trim();
    const runnerPort = (await exec('docker', ['port', runnerContainer, '8080/tcp'])).stdout
      .trim()
      .split(':')
      .pop();
    Object.assign(process.env, {
      // The emulator serves one function, named "function".
      RUNNER_TYPESCRIPT_FUNCTION: 'function',
      RUNNER_JAVA_FUNCTION: 'function',
      AWS_ENDPOINT_URL_LAMBDA: `http://127.0.0.1:${runnerPort}`,
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
  }, 900_000);

  afterAll(async () => {
    if (runnerContainer) await exec('docker', ['rm', '-f', runnerContainer]).catch(() => undefined);
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

  it('never serves SQL-writing questions when no SQL runner is configured', async () => {
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
  });

  it('grades a submission through the runner function: visible and hidden tests', async () => {
    const reference = readFileSync(
      new URL('../../../../content/src/challenges/pangram/reference.ts', import.meta.url),
      'utf8',
    );
    const accepted = await handler(
      event('POST', '/api/challenges/pangram/submissions', {
        language: 'typescript',
        code: reference,
      }),
    );
    expect(accepted.statusCode, accepted.body).toBe(200);
    expect(JSON.parse(accepted.body)).toMatchObject({
      submission: { status: 'accepted', hiddenPassed: 4, hiddenTotal: 4 },
      solvedNow: true,
    });

    const wrong = await handler(
      event('POST', '/api/challenges/pangram/submissions', {
        language: 'typescript',
        code: 'export function isPangram(s: string): boolean { return s.length > 25; }',
      }),
    );
    expect(JSON.parse(wrong.body)).toMatchObject({ submission: { status: 'failed' } });

    const progress = await handler(event('GET', '/api/challenges/progress'));
    expect(JSON.parse(progress.body)).toMatchObject({
      challenges: [{ challengeId: 'pangram', solved: true, attempts: 2 }],
    });
  });
});
