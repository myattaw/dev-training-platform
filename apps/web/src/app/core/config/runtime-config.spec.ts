import { describe, expect, it } from 'vitest';
import { isRuntimeConfig, RuntimeConfigService } from './runtime-config';

const cognito = (extra: Record<string, unknown> = {}) => ({
  auth: {
    mode: 'cognito',
    domain: 'https://pracstack-x.auth.us-east-2.amazoncognito.com',
    clientId: 'abc',
    ...extra,
  },
});

describe('isRuntimeConfig', () => {
  it('accepts local mode and Cognito mode, with or without social providers', () => {
    expect(isRuntimeConfig({ auth: { mode: 'local' } })).toBe(true);
    expect(isRuntimeConfig(cognito())).toBe(true);
    expect(isRuntimeConfig(cognito({ providers: ['Google'] }))).toBe(true);
  });

  it('rejects providers the app does not know, or a malformed list', () => {
    for (const providers of [['Evil'], ['Google', 'Facebook'], 'Google', [42], null])
      expect(isRuntimeConfig(cognito({ providers })), JSON.stringify(providers)).toBe(false);
  });

  it('rejects a non-HTTPS sign-in domain or a missing client', () => {
    expect(isRuntimeConfig(cognito({ domain: 'http://x.example' }))).toBe(false);
    expect(isRuntimeConfig(cognito({ clientId: '' }))).toBe(false);
  });
});

describe('code languages', () => {
  it('accepts a list of known languages and rejects anything else', () => {
    expect(
      isRuntimeConfig({ auth: { mode: 'local' }, codeLanguages: ['typescript', 'java'] }),
    ).toBe(true);
    expect(isRuntimeConfig({ auth: { mode: 'local' }, codeLanguages: ['cobol'] })).toBe(false);
    expect(isRuntimeConfig({ auth: { mode: 'local' }, codeLanguages: 'java' })).toBe(false);
  });

  it('offers only the languages the server can run, or every language without a list', async () => {
    const service = new RuntimeConfigService();
    expect(service.runnable(['typescript', 'python', 'swift'])).toEqual([
      'typescript',
      'python',
      'swift',
    ]);
    const original = globalThis.fetch;
    globalThis.fetch = () =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            auth: { mode: 'local' },
            codeLanguages: ['typescript', 'java', 'csharp'],
          }),
        ),
      );
    try {
      await service.load();
    } finally {
      globalThis.fetch = original;
    }
    expect(service.runnable(['typescript', 'python', 'java', 'swift'])).toEqual([
      'typescript',
      'java',
    ]);
  });
});
