import { describe, expect, it } from 'vitest';
import type { Caller } from '../auth';
import { emptyAccountData, InMemoryAccountStore } from '../store/memory-account';
import { IdentityService } from './identity';

const POOL = 'https://cognito-idp.us-east-2.amazonaws.com/pool';
const caller = (method?: string): Caller => ({
  id: 'gh-sub',
  displayName: 'Learner',
  mode: 'authenticated',
  provider: POOL,
  subject: 'gh-sub',
  ...(method ? { method } : {}),
});

describe('IdentityService: sign-in method labels', () => {
  it('labels an identity saved before its method could be read, keeping its user', async () => {
    const data = emptyAccountData();
    const store = new InMemoryAccountStore(
      () => data,
      () => Promise.resolve(),
      () => false,
    );
    const service = () =>
      new IdentityService(
        store,
        () => new Date('2026-11-25T00:00:00Z'),
        () => 'id',
      );

    // Saved without a label (the claim could not be read): shown as email and password.
    await service().resolve(caller());
    expect(await service().list('gh-sub')).toEqual([
      { provider: 'Email and password', linkedAt: '2026-11-25T00:00:00.000Z' },
    ]);

    // The next cold start reads the method and labels the saved identity.
    const resolved = await service().resolve(caller('GitHub'));
    expect(resolved.id).toBe('gh-sub');
    expect(await service().list('gh-sub')).toEqual([
      { provider: 'GitHub', linkedAt: '2026-11-25T00:00:00.000Z' },
    ]);
  });
});
