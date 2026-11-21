/**
 * Post-deployment check of the runner functions ON AWS. Run it right after
 * every deployment that changes the runners:
 *
 *   npx tsx scripts/verify-runners.ts [stack-name]       (in infra/; default PracStack-dev)
 *
 * It invokes the deployed functions directly (with your AWS CLI credentials)
 * using hostile probe programs, and fails unless:
 *
 *   1. each runner runs a correct program (TypeScript, Java, SQL);
 *   2. learner code cannot reach the network: HTTPS to an AWS endpoint and to
 *      the public internet, and DNS, all fail (the VPC has no route out);
 *   3. no process in the environment exposes AWS credentials, including
 *      Lambda's own init process, which cannot be tested locally.
 *
 * Costs a few Lambda invocations (fractions of a cent). Changes nothing.
 */
import { CloudFormationClient, DescribeStacksCommand } from '@aws-sdk/client-cloudformation';
import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda';
import {
  credentialsHidden,
  ENVIRON_PROBE,
  networkBlocked,
  networkProbe,
  nodeProbe,
} from '@pracstack/runners/probes';

const stackName = process.argv[2] ?? 'PracStack-dev';

const outputs = async (): Promise<Record<string, string>> => {
  const res = await new CloudFormationClient({}).send(
    new DescribeStacksCommand({ StackName: stackName }),
  );
  const list = res.Stacks?.[0]?.Outputs ?? [];
  return Object.fromEntries(list.map((o) => [o.OutputKey ?? '', o.OutputValue ?? '']));
};

const lambda = new LambdaClient({ maxAttempts: 1 });
async function invoke(functionName: string, payload: unknown): Promise<unknown> {
  const res = await lambda.send(
    new InvokeCommand({
      FunctionName: functionName,
      Payload: new TextEncoder().encode(JSON.stringify(payload)),
    }),
  );
  const text = new TextDecoder().decode(res.Payload);
  if (res.FunctionError) throw new Error(`${functionName} failed: ${text}`);
  return JSON.parse(text) as unknown;
}

const valueOf = (result: unknown): unknown => {
  const r = result as { kind?: string; outcomes?: { value?: unknown; error?: string }[] };
  if (r.kind !== 'completed') throw new Error(`Probe did not complete: ${JSON.stringify(result)}`);
  return r.outcomes?.[0]?.value ?? r.outcomes?.[0]?.error;
};

const failures: string[] = [];
const check = (name: string, ok: boolean, detail: string) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? `: ${detail}` : ''}`);
  if (!ok) failures.push(name);
};

const o = await outputs();
const fns = {
  typescript: o['TypescriptRunnerName'],
  java: o['JavaRunnerName'],
  sql: o['SqlRunnerName'],
};
if (!fns.typescript || !fns.java || !fns.sql)
  throw new Error(`Runner outputs missing on ${stackName}.`);

const ts = await invoke(fns.typescript, {
  language: 'typescript',
  code: "export function reverse(s: string): string { return [...s].reverse().join(''); }",
  entryPoint: 'reverse',
  tests: [{ kind: 'call', input: ['abc'] }],
});
check('TypeScript runner runs code', valueOf(ts) === 'cba', JSON.stringify(ts));

const java = await invoke(fns.java, {
  language: 'java',
  code: 'class Solution { static String reverse(String s) { return new StringBuilder(s).reverse().toString(); } }',
  entryPoint: 'reverse',
  tests: [{ kind: 'call', input: ['abc'] }],
});
check('Java runner runs code', valueOf(java) === 'cba', JSON.stringify(java));

const sql = (await invoke(fns.sql, {
  database: { schemaSql: 'CREATE TABLE t (a int);', dataSql: 'INSERT INTO t VALUES (1);' },
  query: 'SELECT a FROM t',
  maxRows: 5,
})) as { kind?: string; rows?: unknown };
check(
  'SQL runner runs a query',
  sql.kind === 'rows' && JSON.stringify(sql.rows) === '[[1]]',
  JSON.stringify(sql),
);

const region = await lambda.config.region();
const network = String(valueOf(await invoke(fns.typescript, nodeProbe(networkProbe(region)))));
check('no network from learner code', networkBlocked(network), network.replace(/\n/g, '; '));

const environ = String(valueOf(await invoke(fns.typescript, nodeProbe(ENVIRON_PROBE)))).trim();
check('no AWS credentials visible in any process', credentialsHidden(environ), environ);

if (failures.length > 0) {
  console.error(
    `\n${failures.length} check(s) failed. Treat the runners as NOT isolated until fixed.`,
  );
  process.exit(1);
}
console.log('\nAll runner isolation checks passed on AWS.');
