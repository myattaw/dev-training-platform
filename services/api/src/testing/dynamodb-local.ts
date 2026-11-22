import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { promisify } from 'node:util';
import { CreateTableCommand, DynamoDBClient } from '@aws-sdk/client-dynamodb';

const exec = promisify(execFile);

/** Pinned so tests are reproducible. Free; runs entirely on this machine. */
export const DYNAMODB_LOCAL_IMAGE = 'amazon/dynamodb-local:3.1.0';

export const skipDockerTests = process.env['PRACSTACK_SKIP_DOCKER_TESTS'] === '1';

export interface DynamoDbLocal {
  readonly client: DynamoDBClient;
  /** Creates a fresh table with the production key schema. */
  createTable(): Promise<string>;
  stop(): Promise<void>;
}

/**
 * Starts DynamoDB Local in a throwaway container on a random loopback port.
 * Fails loudly when Docker is unavailable (set PRACSTACK_SKIP_DOCKER_TESTS=1
 * to skip deliberately), so a missing dependency can't silently pass.
 */
export async function startDynamoDbLocal(): Promise<DynamoDbLocal> {
  const name = `pracstack-dynamodb-test-${randomUUID().slice(0, 8)}`;
  try {
    await exec('docker', [
      'run',
      '-d',
      '--rm',
      '--name',
      name,
      '-p',
      '127.0.0.1::8000',
      DYNAMODB_LOCAL_IMAGE,
      '-jar',
      'DynamoDBLocal.jar',
      '-inMemory',
    ]);
  } catch (err) {
    throw new Error(
      `Could not start DynamoDB Local (${DYNAMODB_LOCAL_IMAGE}). Is Docker running? ` +
        `Set PRACSTACK_SKIP_DOCKER_TESTS=1 to skip. ${(err as Error).message}`,
      { cause: err },
    );
  }
  const { stdout } = await exec('docker', ['port', name, '8000/tcp']);
  const port = stdout.trim().split('\n')[0]?.split(':').pop();
  const client = new DynamoDBClient({
    endpoint: `http://127.0.0.1:${port}`,
    region: 'local',
    credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
  });

  const createTable = async (): Promise<string> => {
    const tableName = `t${randomUUID().replaceAll('-', '')}`;
    // Same key schema as the CDK table (infra/lib/pracstack-stack.ts).
    await client.send(
      new CreateTableCommand({
        TableName: tableName,
        AttributeDefinitions: [
          { AttributeName: 'pk', AttributeType: 'S' },
          { AttributeName: 'sk', AttributeType: 'S' },
        ],
        KeySchema: [
          { AttributeName: 'pk', KeyType: 'HASH' },
          { AttributeName: 'sk', KeyType: 'RANGE' },
        ],
        BillingMode: 'PAY_PER_REQUEST',
      }),
    );
    // TTL is deliberately NOT enabled (production enables it on `ttl`). Its
    // deletion is a background sweep driven by the real clock, so fixtures with
    // fixed timestamps started vanishing mid-test once those dates had passed
    // (a token read back as undefined right after it was written). The stores
    // still write `ttl` exactly as in production; nothing relies on deletion.
    return tableName;
  };

  // Wait until it accepts requests.
  for (let attempt = 0; ; attempt++) {
    try {
      await createTable();
      break;
    } catch (err) {
      if (attempt > 50) throw err;
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  return {
    client,
    createTable,
    stop: async () => {
      client.destroy();
      await exec('docker', ['rm', '-f', name]).catch(() => undefined);
    },
  };
}
