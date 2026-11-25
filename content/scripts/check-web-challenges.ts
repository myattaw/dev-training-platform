/**
 * Runs Web Development Challenge implementations in the real framework runners:
 * starters must fail, references must pass every test, mutants must be caught.
 * Same check as content/src/checks/web-references.spec.ts, aimed at one challenge.
 *
 *   npx tsx content/scripts/check-web-challenges.ts                       # all
 *   npx tsx content/scripts/check-web-challenges.ts employee-rest-api     # one challenge
 *   npx tsx content/scripts/check-web-challenges.ts employee-rest-api django
 *
 * A challenge not registered in src/web-challenges/index.ts yet is loaded from
 * src/web-challenges/<id>/challenge.ts (exports `source` and `mutants`).
 *
 * Needs Docker and the web runner images (npm run web-runners:build).
 */
import { validateWebChallenges } from '@pracstack/content-model';
import { DockerWebRunner } from '@pracstack/web-runner';
import { checkWebChallenge } from '../src/checks/web-references';
import { WEB_CHALLENGES, type WebChallengeEntry } from '../src/web-challenges';

const [challengeId, framework] = process.argv.slice(2);
const runner = new DockerWebRunner({ maxConcurrent: 3, maxQueue: 1000 });
const status = await runner.check();
if (!status.ok) {
  console.error(status.message);
  process.exit(2);
}
let entries: readonly WebChallengeEntry[] = WEB_CHALLENGES;
if (challengeId && !WEB_CHALLENGES.some((e) => e.source.challenge.id === challengeId)) {
  const mod = (await import(
    `../src/web-challenges/${challengeId}/challenge.ts`
  )) as WebChallengeEntry;
  const issues = validateWebChallenges([mod.source]);
  for (const i of issues) console.log(`✗ ${i.path}: ${i.message}`);
  if (issues.length > 0) process.exit(1);
  entries = [mod];
}
let failures = 0;
for (const entry of entries) {
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
