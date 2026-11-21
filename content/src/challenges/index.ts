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
  /** The reference solution module. Private: used only to verify the tests. */
  readonly reference: Readonly<Record<string, unknown>>;
}

/** All challenges, in catalog order. */
export const CHALLENGES: readonly ChallengeEntry[] = [
  { source: pangram, reference: pangramRef },
  { source: reverseString, reference: reverseStringRef },
  { source: balancedBrackets, reference: balancedBracketsRef },
  { source: mergeIntervals, reference: mergeIntervalsRef },
  { source: lruCache, reference: lruCacheRef },
];
