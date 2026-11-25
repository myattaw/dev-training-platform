import type { WebChallengeSource } from '@pracstack/content-model';
import type { Mutant } from './helpers';
import * as consistentErrorHandling from './consistent-error-handling/challenge';
import * as dependencyInjection from './dependency-injection-troubleshooting/challenge';
import * as employeeRestApi from './employee-rest-api/challenge';
import * as fixBrokenTaskApi from './fix-broken-task-api/challenge';
import * as orderService from './order-service/challenge';
import * as paginationSorting from './pagination-sorting/challenge';
import * as productSearchApi from './product-search-api/challenge';
import * as roleBasedAccessControl from './role-based-access-control/challenge';
import * as userRegistration from './user-registration/challenge';

export interface WebChallengeEntry {
  readonly source: WebChallengeSource;
  /** Deliberately wrong solutions the hidden tests must reject (checked with the real runners). */
  readonly mutants: readonly Mutant[];
}

/** All Web Development Challenges, in catalog order. */
export const WEB_CHALLENGES: readonly WebChallengeEntry[] = [
  employeeRestApi,
  userRegistration,
  productSearchApi,
  paginationSorting,
  orderService,
  fixBrokenTaskApi,
  consistentErrorHandling,
  dependencyInjection,
  roleBasedAccessControl,
];
