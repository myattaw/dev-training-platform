import { describe, expect, it } from 'vitest';
import { isRuntimeConfig } from './runtime-config';

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
