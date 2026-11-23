import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ApiErrorBody, PreparationResponse, SavedPlan } from '@pracstack/api-contracts';
import { type JobRole, splitTrack } from '@pracstack/content-model';
import { describe, expect, it } from 'vitest';
import { LocalDevAuthenticator, VerifiedJwtAuthenticator } from '../auth';
import { createContentSource, loadContentSource } from '../content/content-source';
import { FIXTURE_TRACK, testApi } from '../testing/fixtures';

const ROLES: readonly JobRole[] = [
  {
    id: 'backend-developer',
    version: 1,
    status: 'available',
    title: 'Backend Developer',
    summary: 'Servers.',
    description: 'Builds servers.',
    technologies: ['csharp'],
    competencies: [],
  },
  {
    id: 'azure-developer',
    version: 1,
    status: 'coming-soon',
    title: 'Azure Developer',
    summary: 'Cloud.',
    technologies: ['azure'],
  },
];

function content() {
  const { catalog, questionsBySkill } = splitTrack(FIXTURE_TRACK);
  return createContentSource('test', [catalog], questionsBySkill, [], undefined, [], {
    roles: ROLES,
    termIds: ['csharp', 'sql-server', 'azure'],
  });
}

const setup = (overrides: Parameters<typeof testApi>[0] = {}) =>
  testApi({ content: content(), ...overrides });
const errorCode = (body: unknown) => (body as ApiErrorBody).error.code;
const PLAN = { title: 'Contoso backend role', termIds: ['csharp', 'sql-server'] };

describe('target job role', () => {
  it('starts empty, then sets and clears an available role', async () => {
    const api = setup();
    expect((await api.call('GET', '/api/me/preparation')).body).toEqual({
      targetRoleId: null,
      plans: [],
    });
    const set = await api.call('PUT', '/api/me/preparation/target-role', {
      roleId: 'backend-developer',
    });
    expect(set.status).toBe(200);
    expect((set.body as PreparationResponse).targetRoleId).toBe('backend-developer');
    // Per user.
    expect(
      ((await api.call('GET', '/api/me/preparation', undefined, 'bob')).body as PreparationResponse)
        .targetRoleId,
    ).toBeNull();
    const cleared = await api.call('PUT', '/api/me/preparation/target-role', { roleId: null });
    expect((cleared.body as PreparationResponse).targetRoleId).toBeNull();
  });

  it('accepts only existing, available roles', async () => {
    const api = setup();
    const unknown = await api.call('PUT', '/api/me/preparation/target-role', { roleId: 'nope' });
    expect([unknown.status, errorCode(unknown.body)]).toEqual([404, 'not-found']);
    const soon = await api.call('PUT', '/api/me/preparation/target-role', {
      roleId: 'azure-developer',
    });
    expect([soon.status, errorCode(soon.body)]).toEqual([409, 'conflict']);
    for (const body of [{}, { roleId: 5 }, { roleId: '../x' }, [], null]) {
      const res = await api.call('PUT', '/api/me/preparation/target-role', body);
      expect(res.status, JSON.stringify(body)).toBe(400);
    }
  });

  it('stops reporting a target role that is no longer available', async () => {
    const api = setup();
    await api.store.accounts.setTargetRole('alice', 'azure-developer', 't');
    expect(
      ((await api.call('GET', '/api/me/preparation')).body as PreparationResponse).targetRoleId,
    ).toBeNull();
  });
});

describe('saved preparation plans', () => {
  it('saves a plan of term ids, lists it newest first and deletes it', async () => {
    const api = setup();
    const created = await api.call('POST', '/api/me/preparation/plans', {
      title: '  Contoso\u0007 backend\n role ',
      termIds: ['csharp', 'sql-server', 'csharp'],
    });
    expect(created.status).toBe(200);
    const plan = created.body as SavedPlan;
    expect(plan).toEqual({
      id: expect.stringMatching(/^[0-9a-f-]{36}$/),
      title: 'Contoso backend role',
      termIds: ['csharp', 'sql-server'],
      createdAt: '2026-11-21T12:00:00.000Z',
    });
    api.advance(1000);
    const second = (await api.call('POST', '/api/me/preparation/plans', PLAN)).body as SavedPlan;
    const list = (await api.call('GET', '/api/me/preparation')).body as PreparationResponse;
    expect(list.plans.map((p) => p.id)).toEqual([second.id, plan.id]);
    expect(
      ((await api.call('GET', '/api/me/preparation', undefined, 'bob')).body as PreparationResponse)
        .plans,
    ).toEqual([]);

    expect((await api.call('DELETE', `/api/me/preparation/plans/${plan.id}`)).body).toEqual({
      deleted: true,
    });
    const again = await api.call('DELETE', `/api/me/preparation/plans/${plan.id}`);
    expect(again.status).toBe(404);
    // Someone else's plan id is simply not found.
    const bobs = await api.call(
      'DELETE',
      `/api/me/preparation/plans/${second.id}`,
      undefined,
      'bob',
    );
    expect(bobs.status).toBe(404);
    expect((await api.call('DELETE', '/api/me/preparation/plans/not-a-uuid')).status).toBe(400);
  });

  it('keeps at most 10 plans per user (409 beyond)', async () => {
    const api = setup();
    for (let i = 0; i < 10; i++) {
      expect((await api.call('POST', '/api/me/preparation/plans', PLAN)).status).toBe(200);
    }
    const full = await api.call('POST', '/api/me/preparation/plans', PLAN);
    expect([full.status, errorCode(full.body)]).toEqual([409, 'conflict']);
    expect((await api.call('POST', '/api/me/preparation/plans', PLAN, 'bob')).status).toBe(200);
  });

  it('validates titles and term ids against the taxonomy', async () => {
    const api = setup();
    const bad: unknown[] = [
      { title: '', termIds: ['csharp'] },
      { title: ' \n ', termIds: ['csharp'] },
      { title: 'x'.repeat(81), termIds: ['csharp'] },
      { title: 5, termIds: ['csharp'] },
      { title: 'T', termIds: [] },
      { title: 'T', termIds: 'csharp' },
      { title: 'T', termIds: ['Not An Id'] },
      { title: 'T', termIds: Array.from({ length: 61 }, (_, i) => `t${i}`) },
      { title: 'T', termIds: ['cobol'] },
      null,
    ];
    for (const body of bad) {
      const res = await api.call('POST', '/api/me/preparation/plans', body);
      expect(res.status, JSON.stringify(body)?.slice(0, 80)).toBe(400);
    }
    expect(
      (await api.call('POST', '/api/me/preparation/plans', { ...PLAN, title: 'x'.repeat(80) }))
        .status,
    ).toBe(200);
  });

  it('never accepts job-posting text: any field besides title and termIds is refused', async () => {
    const api = setup();
    const posting = 'We need 5+ years of C# and SQL Server.';
    for (const extra of [{ text: posting }, { posting }, { evidence: [posting] }]) {
      const res = await api.call('POST', '/api/me/preparation/plans', { ...PLAN, ...extra });
      expect(res.status).toBe(400);
    }
    await api.call('POST', '/api/me/preparation/plans', PLAN);
    expect(JSON.stringify(await api.store.accounts.getPreparation('alice'))).not.toContain(
      'years of',
    );
  });
});

describe('preparation and sign-in', () => {
  it('requires sign-in on AWS', async () => {
    const api = setup({
      auth: new VerifiedJwtAuthenticator({ issuer: 'https://issuer', audience: 'client' }),
    });
    expect((await api.call('GET', '/api/me/preparation')).status).toBe(401);
    expect((await api.call('POST', '/api/me/preparation/plans', PLAN)).status).toBe(401);
  });

  it('works for the local developer user in local mode', async () => {
    const api = setup({ auth: new LocalDevAuthenticator(), allowLocalDevUser: true });
    await api.call('PUT', '/api/me/preparation/target-role', { roleId: 'backend-developer' });
    expect((await api.store.accounts.getPreparation('local-dev'))?.targetRoleId).toBe(
      'backend-developer',
    );
  });
});

describe('loadContentSource', () => {
  it('reads roles and taxonomy terms from the public files the manifest references', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pracstack-roles-'));
    try {
      const write = (file: string, value: unknown) => {
        mkdirSync(join(dir, 'public'), { recursive: true });
        writeFileSync(join(dir, 'public', file), JSON.stringify(value));
      };
      write('manifest.json', {
        schemaVersion: 1,
        contentVersion: 'v',
        challenges: [],
        technologies: [],
        preparation: { rolesFile: 'roles.json', taxonomyFile: 'taxonomy.json' },
      });
      write('roles.json', { roles: ROLES });
      write('taxonomy.json', { terms: [{ id: 'csharp' }, { id: 'azure' }] });
      const loaded = loadContentSource(dir);
      expect(loaded.findRole('backend-developer')?.title).toBe('Backend Developer');
      expect(loaded.hasTerm('azure')).toBe(true);
      expect(loaded.hasTerm('sql-server')).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
