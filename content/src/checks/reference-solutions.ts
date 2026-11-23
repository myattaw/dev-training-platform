import { runTests } from '@pracstack/challenge-runtime';
import type { ValidationIssue } from '@pracstack/content-model';
import type { ChallengeEntry } from '../challenges';

/**
 * Every challenge's TypeScript reference solution must pass every visible and hidden
 * test. This proves the expected values in the tests are right.
 */
export function checkReferenceSolutions(entries: readonly ChallengeEntry[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const { source, reference } of entries) {
    const path = `challenge:${source.challenge.id}`;
    // Only the TypeScript reference can run in-process. Java references are verified
    // through the real Java runner (services/api/src/challenges/challenge-grading.spec.ts).
    for (const [lang, setup] of Object.entries(source.challenge.languages)) {
      if (!setup || lang !== 'typescript') continue;
      if (!reference) {
        issues.push({
          severity: 'error',
          path: `${path}/${lang}`,
          message: 'TypeScript reference solution is missing',
        });
        continue;
      }
      const tests = [...source.challenge.visibleTests, ...source.hiddenTests];
      const outcome = runTests(reference, setup.entryPoint, tests);
      if (outcome.kind === 'load-error') {
        issues.push({
          severity: 'error',
          path: `${path}/${lang}`,
          message: `reference: ${outcome.message}`,
        });
        continue;
      }
      for (const r of outcome.results.filter((x) => !x.passed)) {
        issues.push({
          severity: 'error',
          path: `${path}/${lang}`,
          message: `reference solution fails "${r.description}": expected ${r.expected}, got ${r.error ?? r.actual}`,
        });
      }
    }
  }
  return issues;
}
