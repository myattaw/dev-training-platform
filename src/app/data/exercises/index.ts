import type { Exercise } from '../../models/exercise';
import { pangram } from './pangram';
import { reverseString } from './reverse-string';

/** Single source of truth for all exercises, in catalog order. */
export const EXERCISES: readonly Exercise[] = [pangram, reverseString];
