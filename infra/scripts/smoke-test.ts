/**
 * Post-deployment smoke test. Public HTTPS requests only: it needs no AWS
 * credentials, signs nobody in, and changes nothing.
 *
 *   npx tsx scripts/smoke-test.ts https://dxxxxxxxxxxxxx.cloudfront.net    (in infra/)
 *   npx tsx scripts/smoke-test.ts --stack PracStack-staging                 (reads SiteUrl; needs AWS credentials)
 *
 * Exits non-zero if any check fails. Signed-in flows (sign-up email, progress,
 * submissions) are manual: see docs/staging-launch.md, "Staging test plan".
 */
import { CloudFormationClient, DescribeStacksCommand } from '@aws-sdk/client-cloudformation';
import { runSmokeChecks } from './smoke-checks';

async function siteUrlFromStack(stackName: string): Promise<string> {
  const res = await new CloudFormationClient({}).send(
    new DescribeStacksCommand({ StackName: stackName }),
  );
  const url = res.Stacks?.[0]?.Outputs?.find((o) => o.OutputKey === 'SiteUrl')?.OutputValue;
  if (!url) throw new Error(`No SiteUrl output on ${stackName}.`);
  return url;
}

const [first, second] = process.argv.slice(2);
if (!first) {
  console.error('Usage: smoke-test.ts <https://site-url> | --stack <stack-name>');
  process.exit(2);
}
const siteUrl = first === '--stack' ? await siteUrlFromStack(second ?? '') : first;
console.log(`Smoke-testing ${siteUrl}\n`);

const results = await runSmokeChecks(siteUrl);
for (const r of results)
  console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${r.name}${r.detail ? `  (${r.detail})` : ''}`);
const failed = results.filter((r) => !r.ok);
if (failed.length > 0) {
  console.error(`\n${failed.length} of ${results.length} checks failed.`);
  process.exit(1);
}
console.log(`\nAll ${results.length} smoke checks passed.`);
