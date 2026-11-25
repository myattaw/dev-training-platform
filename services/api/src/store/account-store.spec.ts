import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { type DynamoDbLocal, skipDockerTests, startDynamoDbLocal } from '../testing/dynamodb-local';
import type { AccountStore, InterviewSessionRecord } from './account-store';
import { DynamoAccountStore } from './dynamo-account';
import { InMemoryProgressStore } from './memory-store';

/*
 * One behavioral contract for account data, run against the in-memory store
 * and the DynamoDB store (DynamoDB Local in Docker).
 */

const session = (
  id: string,
  over: Partial<InterviewSessionRecord> = {},
): InterviewSessionRecord => ({
  id,
  userId: 'alice',
  clientRequestId: `req-${id}`,
  companyId: 'liberty-mutual',
  challengeId: 'text-cursor-buffer',
  language: 'typescript',
  durationMinutes: 45,
  startedAt: '2026-11-22T10:00:00.000Z',
  deadline: '2026-11-22T10:45:00.000Z',
  status: 'active',
  submissions: 0,
  revision: 1,
  ...over,
});

const plan = (id: string) => ({
  id,
  title: `Plan ${id}`,
  termIds: ['csharp', 'sql-server'],
  createdAt: '2026-11-23T10:00:00.000Z',
});

function accountContract(name: string, create: () => Promise<AccountStore>): void {
  describe(name, () => {
    let store: AccountStore;
    beforeEach(async () => {
      store = await create();
    });

    it('stores profiles and entitlements per user', async () => {
      await store.putProfile({ userId: 'alice', displayName: 'Alice', updatedAt: 't' });
      await store.putEntitlement({
        userId: 'alice',
        plan: 'pro',
        source: 'manual-grant',
        grantedAt: 't',
      });
      expect(await store.getProfile('alice')).toMatchObject({ displayName: 'Alice' });
      expect(await store.getEntitlement('alice')).toMatchObject({ plan: 'pro' });
      expect(await store.getProfile('bob')).toBeUndefined();
      expect(await store.getEntitlement('bob')).toBeUndefined();
    });

    it('maps identities once, lists them, and relinks only from the expected user', async () => {
      const id = {
        provider: 'github',
        subject: '42',
        userId: 'gh-42',
        linkedAt: '2026-11-22T10:00:00Z',
      };
      expect(await store.putIdentityIfAbsent(id)).toEqual(id);
      expect(await store.putIdentityIfAbsent({ ...id, userId: 'other' })).toEqual(id);
      expect(await store.getIdentity('github', '42')).toEqual(id);
      expect(await store.listIdentities('gh-42')).toEqual([id]);

      expect(await store.replaceIdentity({ ...id, userId: 'alice' }, 'wrong')).toBe(false);
      expect(await store.replaceIdentity({ ...id, userId: 'alice' }, 'gh-42')).toBe(true);
      expect((await store.getIdentity('github', '42'))?.userId).toBe('alice');
      expect(await store.listIdentities('gh-42')).toEqual([]);
      expect(await store.listIdentities('alice')).toHaveLength(1);
    });

    it('labels an identity with its sign-in method, only for the user it maps to', async () => {
      const id = { provider: 'pool', subject: '7', userId: 'u7', linkedAt: '2026-11-22T10:00:00Z' };
      await store.putIdentityIfAbsent(id);
      expect(await store.setIdentityMethod({ ...id, userId: 'other', method: 'GitHub' })).toBe(
        false,
      );
      expect(await store.setIdentityMethod({ ...id, method: 'GitHub' })).toBe(true);
      expect(await store.getIdentity('pool', '7')).toEqual({ ...id, method: 'GitHub' });
      expect(await store.listIdentities('u7')).toEqual([{ ...id, method: 'GitHub' }]);
    });

    it('consumes link intents once and not after expiry', async () => {
      await store.putLinkIntent({
        token: 't1',
        userId: 'alice',
        expiresAt: '2026-11-22T10:10:00.000Z',
      });
      expect(await store.consumeLinkIntent('t1', '2026-11-22T10:20:00.000Z')).toBeUndefined();
      await store.putLinkIntent({
        token: 't2',
        userId: 'alice',
        expiresAt: '2026-11-22T10:10:00.000Z',
      });
      expect(await store.consumeLinkIntent('t2', '2026-11-22T10:05:00.000Z')).toMatchObject({
        userId: 'alice',
      });
      expect(await store.consumeLinkIntent('t2', '2026-11-22T10:06:00.000Z')).toBeUndefined();
      expect(await store.consumeLinkIntent('missing', '2026-11-22T10:06:00.000Z')).toBeUndefined();
    });

    it('detects whether a user has data (identities alone do not count)', async () => {
      await store.putIdentityIfAbsent({
        provider: 'p',
        subject: 's',
        userId: 'carol',
        linkedAt: 't',
      });
      expect(await store.hasUserData('carol')).toBe(false);
      await store.saveCompany({ userId: 'carol', companyId: 'geico', savedAt: 't' });
      expect(await store.hasUserData('carol')).toBe(true);
    });

    it('saves companies idempotently, keeping the first date', async () => {
      await store.saveCompany({
        userId: 'alice',
        companyId: 'geico',
        savedAt: '2026-11-01T00:00:00Z',
      });
      await store.saveCompany({
        userId: 'alice',
        companyId: 'geico',
        savedAt: '2026-11-05T00:00:00Z',
      });
      await store.saveCompany({
        userId: 'alice',
        companyId: 'paypal',
        savedAt: '2026-11-03T00:00:00Z',
      });
      expect(
        (await store.listSavedCompanies('alice')).map((s) => [s.companyId, s.savedAt]),
      ).toEqual([
        ['paypal', '2026-11-03T00:00:00Z'],
        ['geico', '2026-11-01T00:00:00Z'],
      ]);
      await store.unsaveCompany('alice', 'geico');
      expect((await store.listSavedCompanies('alice')).map((s) => s.companyId)).toEqual(['paypal']);
      expect(await store.listSavedCompanies('bob')).toEqual([]);
    });

    it('sets and clears question marks', async () => {
      const base = {
        userId: 'alice',
        companyId: 'liberty-mutual',
        questionId: 'lc:2296',
        updatedAt: 't',
      };
      await store.setQuestionMark({ ...base, status: 'reviewed-externally' });
      await store.setQuestionMark({ ...base, status: 'solved-externally' });
      expect((await store.listQuestionMarks('alice')).map((m) => m.status)).toEqual([
        'solved-externally',
      ]);
      await store.setQuestionMark({ ...base, status: 'not-started' });
      expect(await store.listQuestionMarks('alice')).toEqual([]);
    });

    it('creates interview sessions once per client request and updates with optimistic concurrency', async () => {
      expect(await store.createInterviewSession(session('s1'))).toEqual({ kind: 'created' });
      const again = await store.createInterviewSession(
        session('s2', { clientRequestId: 'req-s1' }),
      );
      expect(again).toMatchObject({ kind: 'existing', session: { id: 's1' } });
      expect(await store.getInterviewSession('alice', 's2')).toBeUndefined();
      expect(await store.getInterviewSession('bob', 's1')).toBeUndefined();

      const updated = { ...session('s1'), submissions: 1, revision: 2 };
      expect(await store.updateInterviewSession(updated)).toBe(true);
      // A stale writer (also at revision 2) loses.
      expect(await store.updateInterviewSession({ ...updated, submissions: 5 })).toBe(false);
      expect((await store.getInterviewSession('alice', 's1'))?.submissions).toBe(1);

      await store.createInterviewSession(session('s3', { startedAt: '2026-11-22T11:00:00.000Z' }));
      expect((await store.listInterviewSessions('alice', 10)).map((s) => s.id)).toEqual([
        's3',
        's1',
      ]);
      expect((await store.listInterviewSessions('alice', 1)).map((s) => s.id)).toEqual(['s3']);
    });

    it('stores drafts per challenge and language', async () => {
      const draft = {
        userId: 'alice',
        challengeId: 'pangram',
        language: 'typescript' as const,
        code: 'x',
        updatedAt: '2026-11-22T10:00:00Z',
      };
      await store.putDraft(draft);
      await store.putDraft({
        ...draft,
        language: 'java',
        code: 'y',
        updatedAt: '2026-11-22T11:00:00Z',
      });
      expect(await store.getDraft('alice', 'pangram', 'typescript')).toEqual(draft);
      expect((await store.listDrafts('alice')).map((d) => d.language)).toEqual([
        'java',
        'typescript',
      ]);
      expect(await store.getDraft('bob', 'pangram', 'typescript')).toBeUndefined();
    });

    it('sets and clears the target role, keeping saved plans', async () => {
      expect(await store.getPreparation('alice')).toBeUndefined();
      await store.setTargetRole('alice', 'dotnet-backend-developer', '2026-11-23T10:00:00.000Z');
      expect(await store.getPreparation('alice')).toEqual({
        userId: 'alice',
        targetRoleId: 'dotnet-backend-developer',
        plans: [],
        updatedAt: '2026-11-23T10:00:00.000Z',
      });
      await store.addPreparationPlan('alice', plan('p1'), 10, 't2');
      await store.setTargetRole('alice', null, '2026-11-23T11:00:00.000Z');
      const prep = await store.getPreparation('alice');
      expect(prep?.targetRoleId).toBeUndefined();
      expect(prep?.plans.map((p) => p.id)).toEqual(['p1']);
      expect(await store.getPreparation('bob')).toBeUndefined();
    });

    it('adds plans up to the limit, even when requests race, and deletes them', async () => {
      for (const id of ['p1', 'p2']) {
        expect(await store.addPreparationPlan('alice', plan(id), 3, 't')).toBe(true);
      }
      // Two more at once with room for one: exactly one wins.
      const raced = await Promise.all([
        store.addPreparationPlan('alice', plan('p3'), 3, 't'),
        store.addPreparationPlan('alice', plan('p4'), 3, 't'),
      ]);
      expect(raced.filter(Boolean)).toHaveLength(1);
      expect(await store.addPreparationPlan('alice', plan('p5'), 3, 't')).toBe(false);
      const prep = await store.getPreparation('alice');
      expect(prep?.plans).toHaveLength(3);
      expect(prep?.plans[0]).toEqual(plan('p1'));

      expect(await store.deletePreparationPlan('alice', 'p1', 't')).toBe(true);
      expect(await store.deletePreparationPlan('alice', 'p1', 't')).toBe(false);
      expect(await store.deletePreparationPlan('bob', 'p2', 't')).toBe(false);
      expect((await store.getPreparation('alice'))?.plans.map((p) => p.id)).toEqual(
        prep?.plans.slice(1).map((p) => p.id),
      );
      expect(await store.addPreparationPlan('alice', plan('p6'), 3, 't')).toBe(true);
    });

    it('updates only the owner plan with that id, keeping the others in place', async () => {
      await store.addPreparationPlan('alice', plan('p1'), 10, 't');
      await store.addPreparationPlan('alice', plan('p2'), 10, 't');
      const changed = {
        ...plan('p2'),
        title: 'Renamed',
        settings: { format: 'enterprise' as const, interviewDate: '2026-12-01', dailyMinutes: 90 },
        schedule: [{ date: '2026-11-24', items: [{ key: 'skill:cs-oop', minutes: 25 }] }],
        done: ['review:1'],
      };
      expect(await store.updatePreparationPlan('alice', changed, 't2')).toBe(true);
      expect(await store.updatePreparationPlan('bob', changed, 't2')).toBe(false);
      expect(await store.updatePreparationPlan('alice', { ...plan('p9') }, 't2')).toBe(false);
      const prep = await store.getPreparation('alice');
      expect(prep?.plans).toEqual([plan('p1'), changed]);
      expect(prep?.updatedAt).toBe('t2');
    });

    it('counts preparation choices as user data', async () => {
      expect(await store.hasUserData('dave')).toBe(false);
      await store.setTargetRole('dave', 'csharp-dotnet-developer', 't');
      expect(await store.hasUserData('dave')).toBe(true);
    });

    it('stores each import result once', async () => {
      const record = {
        userId: 'alice',
        importId: 'i1',
        importedAt: '2026-11-22T10:00:00.000Z',
        response: { importId: 'i1', imported: 2, unchanged: 0, conflicts: [], replayed: false },
      };
      expect(await store.putImportIfAbsent(record)).toEqual(record);
      const second = await store.putImportIfAbsent({
        ...record,
        response: { ...record.response, imported: 9 },
      });
      expect(second.response.imported).toBe(2);
      expect(await store.getImport('alice', 'i1')).toEqual(record);
      expect(await store.getImport('bob', 'i1')).toBeUndefined();
    });
  });
}

accountContract('InMemoryAccountStore', () =>
  Promise.resolve(new InMemoryProgressStore().accounts),
);

describe.skipIf(skipDockerTests)(
  'DynamoDB account store (DynamoDB Local in Docker)',
  { timeout: 60_000 },
  () => {
    let local: DynamoDbLocal;
    beforeAll(async () => {
      local = await startDynamoDbLocal();
    }, 120_000);
    afterAll(async () => {
      await local?.stop();
    });

    accountContract('DynamoAccountStore', async () => {
      return new DynamoAccountStore({ tableName: await local.createTable(), client: local.client });
    });
  },
);
