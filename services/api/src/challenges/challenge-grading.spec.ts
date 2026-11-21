import { readFileSync } from 'node:fs';
import type { SubmissionResponse } from '@pracstack/api-contracts';
import { CHALLENGES } from '@pracstack/content';
import { DockerCodeRunner } from '@pracstack/code-runner';
import { type LanguageId, splitChallenge } from '@pracstack/content-model';
import { beforeAll, describe, expect, it } from 'vitest';
import { createContentSource } from '../content/content-source';
import { SlidingWindowRateLimiter } from '../rate-limit';
import { testApi } from '../testing/fixtures';

/*
 * End-to-end grading through the real runner containers. Proves that every
 * reference solution (TypeScript and Java) passes all visible and hidden
 * tests, and that starter code does not. Needs Docker and the runner images
 * (`npm run runners:build`); set PRACSTACK_SKIP_DOCKER_TESTS=1 to skip.
 */
const skip = process.env['PRACSTACK_SKIP_DOCKER_TESTS'] === '1';
const runner = new DockerCodeRunner({ maxConcurrent: 3 });

beforeAll(async () => {
  if (skip) return;
  const status = await runner.check();
  if (!status.ok) throw new Error(`${status.message} (set PRACSTACK_SKIP_DOCKER_TESTS=1 to skip)`);
}, 60_000);

const content = createContentSource(
  'test',
  [],
  {},
  CHALLENGES.map((entry) => {
    const { challenge, grading } = splitChallenge(entry.source);
    return { challenge, grading };
  }),
);
const api = testApi({
  content,
  codeRunner: runner,
  codeRateLimiter: new SlidingWindowRateLimiter(1000, 60_000),
});

const typescriptReference = (id: string): string =>
  readFileSync(
    new URL(`../../../../content/src/challenges/${id}/reference.ts`, import.meta.url),
    'utf8',
  );

const submit = async (id: string, language: LanguageId, code: string) => {
  const res = await api.call('POST', `/api/challenges/${id}/submissions`, { language, code });
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body as SubmissionResponse;
};

describe.skipIf(skip)('grading real challenges in containers', { timeout: 120_000 }, () => {
  for (const entry of CHALLENGES) {
    const { id, languages } = entry.source.challenge;

    it(`${id}: the TypeScript reference is accepted`, async () => {
      const res = await submit(id, 'typescript', typescriptReference(id));
      expect(res.submission, JSON.stringify(res.detail)).toMatchObject({ status: 'accepted' });
      expect(res.submission.hiddenPassed).toBe(res.submission.hiddenTotal);
    });

    it(`${id}: the Java reference is accepted`, async () => {
      const res = await submit(id, 'java', entry.javaReference);
      expect(res.submission, JSON.stringify(res.detail)).toMatchObject({ status: 'accepted' });
      expect(res.submission.hiddenPassed).toBe(res.submission.hiddenTotal);
    });

    it(`${id}: starter code compiles in both languages but is not accepted`, async () => {
      for (const language of ['typescript', 'java'] as const) {
        const starter = languages[language]?.starterCode ?? '';
        const res = await submit(id, language, starter);
        expect(res.submission.status, `${language}: ${JSON.stringify(res.detail)}`).toBe('failed');
      }
    });
  }
});
