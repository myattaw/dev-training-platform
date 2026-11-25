import type { WebChallengeSource } from '@pracstack/content-model';
import type { Mutant } from './helpers';
import * as employeeRestApi from './employee-rest-api/challenge';

export interface WebChallengeEntry {
  readonly source: WebChallengeSource;
  /** Deliberately wrong solutions the hidden tests must reject (checked with the real runners). */
  readonly mutants: readonly Mutant[];
}

/** All Web Development Challenges, in catalog order. */
export const WEB_CHALLENGES: readonly WebChallengeEntry[] = [employeeRestApi];
