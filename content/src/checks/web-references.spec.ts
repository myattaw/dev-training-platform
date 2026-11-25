import { DockerWebRunner } from '@pracstack/web-runner';
import { describe, expect, it } from 'vitest';
import { WEB_CHALLENGES } from '../web-challenges';
import { checkWebChallenge, toIssues } from './web-references';

/*
 * Builds and runs every available Web Development Challenge implementation in
 * the real framework runners (see web-references.ts). Needs Docker and the web
 * runner images (`npm run web-runners:build`); set PRACSTACK_SKIP_DOCKER_TESTS=1
 * to skip.
 */
const skip = process.env['PRACSTACK_SKIP_DOCKER_TESTS'] === '1';

describe.skipIf(skip)('Web Development Challenges (real framework runners)', () => {
  const runner = new DockerWebRunner({ maxConcurrent: 3, maxQueue: 1000 });
  for (const entry of WEB_CHALLENGES) {
    it(
      `${entry.source.challenge.id}: starters fail, references pass, mutants are caught`,
      { timeout: 900_000 },
      async () => {
        const status = await runner.check();
        if (!status.ok) {
          throw new Error(`${status.message} (set PRACSTACK_SKIP_DOCKER_TESTS=1 to skip)`);
        }
        const results = await checkWebChallenge(runner, entry);
        expect(results.length).toBeGreaterThan(0);
        expect(toIssues(results)).toEqual([]);
      },
    );
  }
});
