import { describe, expect, it } from 'vitest';
import {
  appContentSecurityPolicy,
  isWorkerPath,
  securityHeadersFor,
  workerContentSecurityPolicy,
} from './index';

describe('web security headers', () => {
  it('allows no inline or evaluated script in pages', () => {
    const csp = appContentSecurityPolicy();
    expect(csp).toContain("script-src 'self';");
    expect(csp).not.toContain('unsafe-eval');
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
  });

  it('adds extra connect origins and HTTPS-only directives when asked', () => {
    const csp = appContentSecurityPolicy({
      connectOrigins: ['https://x.auth.us-east-2.amazoncognito.com'],
      https: true,
    });
    expect(csp).toContain("connect-src 'self' https://x.auth.us-east-2.amazoncognito.com");
    expect(csp).toContain('upgrade-insecure-requests');
    expect(securityHeadersFor('/', { https: true })['strict-transport-security']).toBeDefined();
    expect(securityHeadersFor('/')['strict-transport-security']).toBeUndefined();
  });

  it('gives workers eval but no network', () => {
    expect(workerContentSecurityPolicy()).toContain("'unsafe-eval'");
    expect(workerContentSecurityPolicy()).toContain("connect-src 'none'");
    expect(securityHeadersFor('/worker-ABC123.js')['content-security-policy']).toBe(
      workerContentSecurityPolicy(),
    );
  });

  it('recognises only built worker files as workers', () => {
    expect(isWorkerPath('/worker-UPO43OHT.js')).toBe(true);
    // Angular 22 hashes also use lowercase letters, '-' and '_'.
    expect(isWorkerPath('/worker-5r1-tvj6.js')).toBe(true);
    expect(isWorkerPath('/worker-B0vU_33C.js')).toBe(true);
    for (const path of ['/main-ABC.js', '/content/worker-A.js', '/worker-x.js.map', '/worker-.js'])
      expect(isWorkerPath(path)).toBe(false);
  });
});
