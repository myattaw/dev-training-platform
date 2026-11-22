import { ApiError, badRequest } from '../http';
import type { Caller } from '../auth';
import type { AccountStore, IdentityRecord } from '../store/account-store';

/*
 * Stable internal user ids, independent of how someone signs in.
 *
 * Every (provider, subject) pair maps to one internal user id. The first time
 * an identity is seen it is mapped to its own subject (a UUID minted by
 * PracStack's Cognito user pool), so existing progress keeps its key. A
 * second sign-in method (e.g. GitHub, once configured) can then be linked to
 * the same internal user, so progress is never duplicated.
 *
 * Linking never happens because two identities share an email address. It
 * needs proof from both sides: a single-use, short-lived link token created
 * while signed in to the account, redeemed while signed in with the new
 * identity.
 */

export const LINK_INTENT_TTL_MS = 10 * 60 * 1000;
const CACHE_LIMIT = 1000;

export interface LinkIntentResponse {
  readonly token: string;
  readonly expiresAt: string;
}

export interface IdentityView {
  readonly provider: string;
  readonly linkedAt: string;
}

export class IdentityService {
  /** (provider, subject) → user id; mappings change only through this service. */
  private readonly cache = new Map<string, string>();

  constructor(
    private readonly store: AccountStore,
    private readonly now: () => Date,
    private readonly newId: () => string,
  ) {}

  /** The caller with `id` replaced by the internal user id. */
  async resolve(caller: Caller): Promise<Caller> {
    if (!caller.provider || !caller.subject) return caller;
    const key = `${caller.provider}#${caller.subject}`;
    let userId = this.cache.get(key);
    if (userId === undefined) {
      const existing = await this.store.getIdentity(caller.provider, caller.subject);
      const record =
        existing ??
        (await this.store.putIdentityIfAbsent({
          provider: caller.provider,
          subject: caller.subject,
          userId: caller.subject,
          linkedAt: this.now().toISOString(),
        }));
      userId = record.userId;
      if (this.cache.size >= CACHE_LIMIT) this.cache.clear();
      this.cache.set(key, userId);
    }
    return { ...caller, id: userId };
  }

  async list(userId: string): Promise<readonly IdentityView[]> {
    const identities = await this.store.listIdentities(userId);
    return identities.map((i) => ({ provider: describeProvider(i), linkedAt: i.linkedAt }));
  }

  /** Step 1, signed in to the account that should receive the new identity. */
  async createLinkIntent(caller: Caller): Promise<LinkIntentResponse> {
    if (caller.mode !== 'authenticated') {
      throw badRequest('Linking sign-in methods needs a signed-in account.');
    }
    const expiresAt = new Date(this.now().getTime() + LINK_INTENT_TTL_MS).toISOString();
    const token = this.newId();
    await this.store.putLinkIntent({ token, userId: caller.id, expiresAt });
    return { token, expiresAt };
  }

  /**
   * Step 2, signed in with the identity to link (`raw`: before resolution).
   * Refuses when that identity already has progress of its own: merging two
   * accounts' progress is not automatic.
   */
  async completeLink(raw: Caller, token: string): Promise<{ readonly userId: string }> {
    if (!raw.provider || !raw.subject) {
      throw badRequest('This sign-in method cannot be linked.');
    }
    const intent = await this.store.consumeLinkIntent(token, this.now().toISOString());
    if (!intent) throw badRequest('This link request is invalid, used or expired. Start again.');

    const record: IdentityRecord = {
      provider: raw.provider,
      subject: raw.subject,
      userId: intent.userId,
      linkedAt: this.now().toISOString(),
    };
    const existing = await this.store.getIdentity(raw.provider, raw.subject);
    if (existing?.userId === intent.userId) return { userId: intent.userId };
    if (existing) {
      if (await this.store.hasUserData(existing.userId)) {
        throw new ApiError(
          'conflict',
          'This sign-in method already has its own PracStack progress, so it cannot be linked automatically.',
        );
      }
      if (!(await this.store.replaceIdentity(record, existing.userId))) {
        throw new ApiError('conflict', 'The sign-in method changed meanwhile. Try again.');
      }
    } else {
      const stored = await this.store.putIdentityIfAbsent(record);
      if (stored.userId !== intent.userId) {
        throw new ApiError('conflict', 'The sign-in method changed meanwhile. Try again.');
      }
    }
    this.cache.delete(`${raw.provider}#${raw.subject}`);
    return { userId: intent.userId };
  }
}

function describeProvider(identity: IdentityRecord): string {
  if (identity.provider === 'local-dev') return 'Local development';
  if (/cognito-idp\./.test(identity.provider)) return 'Email and password';
  return identity.provider;
}
