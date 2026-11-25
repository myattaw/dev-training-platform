/**
 * Runs Web Development Challenge implementations in the real framework runners:
 * starters must fail, references must pass every test, mutants must be caught.
 * Same check as content/src/checks/web-references.spec.ts, aimed at one challenge.
 *
 *   npx tsx content/scripts/check-web-challenges.ts                       # all
 *   npx tsx content/scripts/check-web-challenges.ts employee-rest-api     # one challenge
 *   npx tsx content/scripts/check-web-challenges.ts employee-rest-api django
 *
 * Needs Docker and the web runner images (npm run web-runners:build).
 */
import { DockerWebRunner } from '@pracstack/web-runner';
import { checkWebChallenge } from '../src/checks/web-references';
import { WEB_CHALLENGES } from '../src/web-challenges';

const [challengeId, framework] = process.argv.slice(2);
const runner = new DockerWebRunner({ maxConcurrent: 3, maxQueue: 1000 });
const status = await runner.check();
if (!status.ok) {
  console.error(status.message);
  process.exit(2);
}
let failures = 0;
for (const entry of WEB_CHALLENGES) {
  if (challengeId && entry.source.challenge.id !== challengeId) continue;
  const results = await checkWebChallenge(runner, entry, framework ? { framework } : {});
  for (const r of results) {
    if (!r.ok) failures++;
    console.log(
      `${r.ok ? '✓' : '✗'} ${r.challengeId} · ${r.framework} · ${r.variant} (${Math.round(r.durationMs / 1000)} s): ${r.detail}`,
    );
  }
}
console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} checks failed.`);
process.exit(failures === 0 ? 0 : 1);
