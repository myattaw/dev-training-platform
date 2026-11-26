import { execFile } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { WEB_CHALLENGES } from '@pracstack/content/web-challenges';
import type { APIGatewayProxyEventV2WithJWTAuthorizer } from 'aws-lambda';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildLambda } from '../../scripts/build-lambda';
// The runner image build of services/runners (a test-only cross-workspace import).
import { buildContexts, buildLocalImages, localImage } from '../../../runners/scripts/build';
import { type DynamoDbLocal, skipDockerTests, startDynamoDbLocal } from '../testing/dynamodb-local';

/*
 * Web challenge runs the way they go on AWS, with the real bundles: the API
 * bundle stores a run in DynamoDB (DynamoDB Local) and starts the web worker
 * with an asynchronous Lambda invoke; the worker bundle waits for a global
 * slot, invokes the real Django web runner image (under the Lambda Runtime
 * Interface Emulator), verifies the signed response, grades it and completes
 * the run, which the API then serves. A small fake Lambda endpoint routes the
 * two invokes (the emulator serves only one function and no async invokes).
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
            sub: 'web-smoke-user',
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

const employee = WEB_CHALLENGES[0]!.source;
const reference = employee.implementations.find((i) => i.framework === 'django')!.reference;

describe.skipIf(skipDockerTests)('web runs through the built bundles', { timeout: 300_000 }, () => {
  let local: DynamoDbLocal;
  let api: Handler;
  let runnerContainer = '';
  let fakeLambda: Server;
  /** Set by a test: alter the runner's response on its way back (a forgery). */
  let tamper = false;
  const outDir = mkdtempSync(join(tmpdir(), 'pracstack-web-lambda-'));

  beforeAll(async () => {
    local = await startDynamoDbLocal();
    const tableName = await local.createTable();
    const endpoint = await local.client.config.endpoint?.();
    await buildContexts();
    buildLocalImages(['web-django']);
    runnerContainer = (
      await exec('docker', [
        'run',
        '-d',
        '--rm',
        '-p',
        '127.0.0.1::9000',
        '--user',
        '993:990',
        '--read-only',
        '--tmpfs',
        '/tmp:rw,exec,size=1024m',
        '--memory',
        '2048m',
        localImage('web-django'),
      ])
    ).stdout.trim();
    const runnerPort = (await exec('docker', ['port', runnerContainer, '9000/tcp'])).stdout
      .trim()
      .split(':')
      .pop();
    const runnerUrl = `http://127.0.0.1:${runnerPort}/2015-03-31/functions/function/invocations`;

    const worker: { handler?: (e: unknown) => Promise<void> } = {};
    fakeLambda = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (c: Buffer) => chunks.push(c));
      req.on('end', () => {
        const name = decodeURIComponent(/functions\/([^/]+)\//.exec(req.url ?? '')?.[1] ?? '');
        const payload = Buffer.concat(chunks).toString('utf8');
        if (name === 'web-worker' && req.headers['x-amz-invocation-type'] === 'Event') {
          res.writeHead(202).end();
          void worker.handler?.(JSON.parse(payload));
          return;
        }
        if (name === 'web-django') {
          void (async () => {
            for (let attempt = 0; ; attempt++) {
              try {
                const r = await fetch(runnerUrl, { method: 'POST', body: payload });
                let text = await r.text();
                if (tamper) text = text.replace('"kind\\":\\"', '"kind\\":\\"x');
                res.writeHead(200, { 'content-type': 'application/json' }).end(text);
                return;
              } catch (err) {
                if (attempt > 40) throw err;
                await new Promise((r) => setTimeout(r, 250));
              }
            }
          })();
          return;
        }
        res.writeHead(404).end(JSON.stringify({ message: `No function ${name}` }));
      });
    });
    await new Promise<void>((r) => fakeLambda.listen(0, '127.0.0.1', r));
    const lambdaPort = (fakeLambda.address() as AddressInfo).port;

    Object.assign(process.env, {
      WEB_WORKER_FUNCTION: 'web-worker',
      WEB_RUNNER_DJANGO_FUNCTION: 'web-django',
      WEB_QUEUE_WAIT_MS: '60000',
      AWS_ENDPOINT_URL_LAMBDA: `http://127.0.0.1:${lambdaPort}`,
      TABLE_NAME: tableName,
      JWT_ISSUER: ISSUER,
      JWT_AUDIENCE: CLIENT,
      AWS_REGION: 'local',
      AWS_ACCESS_KEY_ID: 'local',
      AWS_SECRET_ACCESS_KEY: 'local',
      AWS_ENDPOINT_URL_DYNAMODB: `http://${endpoint?.hostname}:${endpoint?.port}`,
    });
    await buildLambda(outDir);
    api = ((await import(pathToFileURL(join(outDir, 'index.mjs')).href)) as { handler: Handler })
      .handler;
    worker.handler = (
      (await import(pathToFileURL(join(outDir, 'web-worker.mjs')).href)) as {
        handler: (e: unknown) => Promise<void>;
      }
    ).handler;
  }, 900_000);

  afterAll(async () => {
    if (runnerContainer) await exec('docker', ['rm', '-f', runnerContainer]).catch(() => undefined);
    await new Promise((r) => fakeLambda?.close(r));
    await local?.stop();
    rmSync(outDir, { recursive: true, force: true });
  });

  const runToCompletion = async (files: Record<string, string>) => {
    const created = await api(
      event('POST', '/api/web-challenges/employee-rest-api/runs', {
        framework: 'django',
        files,
        mode: 'submit',
      }),
    );
    expect(created.statusCode, created.body).toBe(200);
    const id = (JSON.parse(created.body) as { run: { id: string } }).run.id;
    for (let i = 0; i < 240; i++) {
      const res = await api(event('GET', `/api/web-runs/${id}`));
      const run = (JSON.parse(res.body) as { run: { status: string; result?: unknown } }).run;
      if (run.status === 'completed')
        return run as { result: { verdict: string; hidden: { passed: boolean }[] } };
      await new Promise((r) => setTimeout(r, 500));
    }
    throw new Error('the run did not complete');
  };

  it('reports execution as available when the web worker is configured', async () => {
    const res = await api(event('GET', '/api/web-challenges/employee-rest-api'));
    expect(res.statusCode, res.body).toBe(200);
    expect(JSON.parse(res.body)).toMatchObject({ executionAvailable: true });
  });

  it('grades a reference submission end to end and records progress in DynamoDB', async () => {
    const run = await runToCompletion(reference);
    expect(run.result.verdict, JSON.stringify(run.result)).toBe('accepted');
    expect(run.result.hidden.every((h) => h.passed)).toBe(true);
    const progress = await api(event('GET', '/api/web-challenges/progress'));
    expect(JSON.parse(progress.body)).toMatchObject({
      challenges: [{ challengeId: 'employee-rest-api', solved: true, attempts: 1 }],
    });
  });

  it('a runner response altered on the way back is an infrastructure error, not a grade', async () => {
    tamper = true;
    try {
      const run = await runToCompletion(reference);
      expect(run.result.verdict).toBe('infrastructure-error');
    } finally {
      tamper = false;
    }
    // Not counted as an attempt.
    const progress = await api(event('GET', '/api/web-challenges/progress'));
    expect(JSON.parse(progress.body)).toMatchObject({ challenges: [{ attempts: 1 }] });
  });
});
