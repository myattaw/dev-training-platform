import type { Challenge } from '../models/challenge';
import { balancedBrackets } from './balanced-brackets';
import { mergeIntervals } from './merge-intervals';
import { pangram } from './pangram';
import { reverseString } from './reverse-string';

/**
 * Bundled sample challenges, in catalog order.
 *
 * Temporary: content moves to a versioned content package (with public/private
 * separation) in Phase 2. Components must access it through ChallengeCatalogService.
 */
export const CHALLENGES: readonly Challenge[] = [
  pangram,
  reverseString,
  balancedBrackets,
  mergeIntervals,
];
