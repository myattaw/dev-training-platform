import { readFileSync } from 'node:fs';
import type { ChallengeSource } from '@pracstack/content-model';
import { source as balancedBrackets } from './balanced-brackets/challenge';
import * as balancedBracketsRef from './balanced-brackets/reference';
import { source as lruCache } from './lru-cache/challenge';
import * as lruCacheRef from './lru-cache/reference';
import { source as mergeIntervals } from './merge-intervals/challenge';
import * as mergeIntervalsRef from './merge-intervals/reference';
import { source as pangram } from './pangram/challenge';
import * as pangramRef from './pangram/reference';
import { source as reverseString } from './reverse-string/challenge';
import * as reverseStringRef from './reverse-string/reference';

export interface ChallengeEntry {
  readonly source: ChallengeSource;
  /** The TypeScript reference solution module. Private: used only to verify the tests. */
  readonly reference: Readonly<Record<string, unknown>>;
  /**
   * The Java reference solution source, verified against every test through the
   * real Java runner (services/api/src/challenges/challenge-grading.spec.ts).
   */
  readonly javaReference: string;
}

const javaReference = (id: string): string =>
  readFileSync(new URL(`./${id}/Reference.java`, import.meta.url), 'utf8');

/** All challenges, in catalog order. */
export const CHALLENGES: readonly ChallengeEntry[] = [
  { source: pangram, reference: pangramRef, javaReference: javaReference('pangram') },
  {
    source: reverseString,
    reference: reverseStringRef,
    javaReference: javaReference('reverse-string'),
  },
  {
    source: balancedBrackets,
    reference: balancedBracketsRef,
    javaReference: javaReference('balanced-brackets'),
  },
  {
    source: mergeIntervals,
    reference: mergeIntervalsRef,
    javaReference: javaReference('merge-intervals'),
  },
  { source: lruCache, reference: lruCacheRef, javaReference: javaReference('lru-cache') },
];
