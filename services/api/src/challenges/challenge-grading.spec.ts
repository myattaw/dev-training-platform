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
 * reference solution (TypeScript, Java and C#) passes all visible and hidden
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

    it(`${id}: the C# reference is accepted`, async () => {
      const res = await submit(id, 'csharp', entry.csharpReference);
      expect(res.submission, JSON.stringify(res.detail)).toMatchObject({ status: 'accepted' });
      expect(res.submission.hiddenPassed).toBe(res.submission.hiddenTotal);
    });

    it(`${id}: starter code compiles in every language but is not accepted`, async () => {
      for (const language of ['typescript', 'java', 'csharp'] as const) {
        const starter = languages[language]?.starterCode ?? '';
        const res = await submit(id, language, starter);
        expect(res.submission.status, `${language}: ${JSON.stringify(res.detail)}`).toBe('failed');
      }
    });
  }
});

/*
 * Common mistakes, written in C#. Each compiles and runs, so the tests (not the
 * compiler) must catch it: a grader that accepted any of these would be too lenient.
 */
const INCORRECT_CSHARP: readonly { id: string; mistake: string; code: string }[] = [
  {
    id: 'pangram',
    mistake: 'a case-sensitive pangram check',
    code: `public static class Solution
{
    public static bool IsPangram(string sentence) =>
        sentence.Where(c => c >= 'a' && c <= 'z').Distinct().Count() == 26;
}
`,
  },
  {
    id: 'balanced-brackets',
    mistake: 'only counting brackets, ignoring their order',
    code: `public static class Solution
{
    public static bool IsBalanced(string text) =>
        text.Count(c => c == '(') == text.Count(c => c == ')')
        && text.Count(c => c == '[') == text.Count(c => c == ']')
        && text.Count(c => c == '{') == text.Count(c => c == '}');
}
`,
  },
  {
    id: 'merge-intervals',
    mistake: 'merging without sorting first',
    code: `public static class Solution
{
    public static int[][] Merge(int[][] intervals)
    {
        var merged = new List<int[]>();
        foreach (var interval in intervals)
        {
            if (merged.Count > 0 && interval[0] <= merged[^1][1])
                merged[^1][1] = Math.Max(merged[^1][1], interval[1]);
            else
                merged.Add([interval[0], interval[1]]);
        }
        return merged.ToArray();
    }
}
`,
  },
  {
    id: 'lru-cache',
    mistake: 'an LRU cache that never evicts',
    code: `public class LRUCache
{
    private readonly Dictionary<int, int> _entries = new();

    public LRUCache(int capacity) { }

    public int Get(int key) => _entries.TryGetValue(key, out var value) ? value : -1;

    public void Put(int key, int value) => _entries[key] = value;
}
`,
  },
];

describe.skipIf(skip)('rejecting incorrect C# solutions', { timeout: 120_000 }, () => {
  for (const { id, mistake, code } of INCORRECT_CSHARP) {
    it(`${id}: ${mistake} is not accepted`, async () => {
      const res = await submit(id, 'csharp', code);
      expect(res.submission.status, JSON.stringify(res.detail)).toBe('failed');
    });
  }
});
