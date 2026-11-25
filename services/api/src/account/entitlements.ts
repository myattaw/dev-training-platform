import type {
  EntitlementsResponse,
  EntitlementSource,
  Feature,
  Plan,
} from '@pracstack/api-contracts';
import { ApiError } from '../http';
import type { AccountStore } from '../store/account-store';
import type { Caller } from '../auth';

/*
 * Server-side authorization for paid features.
 *
 * The plan comes only from server-side sources, in this order:
 *   1. ADMIN: membership of the `admins` group in the identity provider
 *      (a verified token claim; on AWS a Cognito group);
 *   2. PRO: an entitlement record in the store, written by an operator today
 *      and by a billing webhook later (see docs/monetization.md), and not expired;
 *   3. otherwise FREE.
 * Nothing in a request body, header or query can change it.
 *
 * Features are checked by name, so a billing provider can be connected later
 * without changing any call site.
 */

export const ADMIN_GROUP = 'admins';

const ALL_FEATURES: readonly Feature[] = [
  'premium-recommendations',
  'advanced-preparation-plans',
  'advanced-mock-interviews',
  'progress-analytics',
  'premium-web-challenges',
];

export const PLAN_FEATURES: Readonly<Record<Plan, readonly Feature[]>> = {
  free: [],
  pro: ALL_FEATURES,
  admin: ALL_FEATURES,
};

export interface ResolvedEntitlements {
  readonly plan: Plan;
  readonly source: EntitlementSource;
  readonly features: ReadonlySet<Feature>;
}

export interface EntitlementServiceOptions {
  readonly store: AccountStore;
  readonly now: () => Date;
  /**
   * Local development only: pretend the local developer has this plan, to try
   * Pro features without a billing provider. `createApi` refuses it unless the
   * unauthenticated local-dev authenticator is in use.
   */
  readonly localPlanOverride?: Plan;
}

export class EntitlementService {
  constructor(private readonly options: EntitlementServiceOptions) {}

  async resolve(caller: Caller): Promise<ResolvedEntitlements> {
    const make = (plan: Plan, source: EntitlementSource): ResolvedEntitlements => ({
      plan,
      source,
      features: new Set(PLAN_FEATURES[plan]),
    });
    if (this.options.localPlanOverride && caller.mode === 'local-dev') {
      return make(this.options.localPlanOverride, 'local-override');
    }
    if (caller.groups?.includes(ADMIN_GROUP)) return make('admin', 'identity-group');
    const record = await this.options.store.getEntitlement(caller.id);
    const active =
      record !== undefined &&
      record.plan === 'pro' &&
      (record.expiresAt === undefined ||
        Date.parse(record.expiresAt) > this.options.now().getTime());
    return active ? make('pro', record.source) : make('free', 'default');
  }

  async describe(caller: Caller): Promise<EntitlementsResponse> {
    const resolved = await this.resolve(caller);
    return {
      plan: resolved.plan,
      source: resolved.source,
      features: [...resolved.features],
      billing: { available: false },
    };
  }

  /** Throws 403 unless the caller's plan includes `feature`. */
  async require(caller: Caller, feature: Feature): Promise<void> {
    const resolved = await this.resolve(caller);
    if (!resolved.features.has(feature)) {
      throw new ApiError(
        'forbidden',
        'This feature is part of PracStack Pro, which is not available yet.',
      );
    }
  }
}
