import { PLAN_KEY_PATTERN } from '@pracstack/api-contracts';
import { ROLES, TAXONOMY } from '@pracstack/content';
import { activityKey, type ActivityRef } from '@pracstack/content-model';
import { describe, expect, it } from 'vitest';

/*
 * Saved study plans store activity keys, validated by PLAN_KEY_PATTERN. Every
 * activity a role or taxonomy term can put into a plan must be storable (web
 * challenges and the Python/Swift challenge languages once were not).
 */
describe('plan activity keys', () => {
  it('accepts the key of every activity in the roles and the taxonomy', () => {
    const refs: ActivityRef[] = [
      ...ROLES.flatMap((r) =>
        r.status === 'available' ? r.competencies.flatMap((c) => c.activities) : [],
      ),
      ...TAXONOMY.flatMap((t) => [...t.practice, ...(t.relatedPractice ?? [])]),
    ];
    const keys = [...new Set(refs.map(activityKey))];
    expect(keys.some((k) => k.startsWith('web-challenge:'))).toBe(true);
    expect(keys.filter((k) => !PLAN_KEY_PATTERN.test(k))).toEqual([]);
  });

  it('accepts every language and framework a key can name', () => {
    for (const key of [
      'challenge:pangram:python',
      'challenge:pangram:swift',
      'web-challenge:employee-rest-api',
      'web-challenge:employee-rest-api:spring-boot',
      'web-challenge:employee-rest-api:django',
      'web-challenge:employee-rest-api:aspnetcore',
    ]) {
      expect(PLAN_KEY_PATTERN.test(key), key).toBe(true);
    }
    expect(PLAN_KEY_PATTERN.test('web-challenge:x:rails')).toBe(false);
    expect(PLAN_KEY_PATTERN.test('challenge:x:cobol')).toBe(false);
  });
});
