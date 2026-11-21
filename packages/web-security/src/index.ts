/**
 * HTTP security headers for the web app, defined once and used by both the
 * CloudFront response-headers policies (infra) and the local server that the
 * end-to-end tests run against, so the tests exercise the production policy.
 */

export interface WebSecurityOptions {
  /**
   * Extra origins the app may call with fetch(), e.g. the Cognito domain for
   * the OAuth token exchange (`https://<prefix>.auth.<region>.amazoncognito.com`).
   */
  readonly connectOrigins?: readonly string[];
  /** HTTPS deployments only: HSTS and upgrading insecure requests. */
  readonly https?: boolean;
}

/**
 * Worker scripts are emitted as `worker-<hash>.js` and get their own policy:
 * the in-browser test runner evaluates learner code with `new Function`, which
 * needs 'unsafe-eval', and is denied all network access.
 * Matches CloudFront path patterns and is tested against built file names.
 */
export const WORKER_PATH_PATTERN = '/worker-*.js';
export const isWorkerPath = (path: string): boolean => /^\/worker-[A-Z0-9]+\.js$/.test(path);

const join = (directives: Readonly<Record<string, readonly string[]>>): string =>
  Object.entries(directives)
    .map(([name, values]) => [name, ...values].join(' '))
    .join('; ');

/** Policy for the app's pages. No inline or evaluated script. */
export function appContentSecurityPolicy(options: WebSecurityOptions = {}): string {
  return join({
    'default-src': ["'self'"],
    'script-src': ["'self'"],
    // Angular component styles and Monaco set inline styles.
    'style-src': ["'self'", "'unsafe-inline'"],
    'img-src': ["'self'", 'data:'],
    'font-src': ["'self'", 'data:'],
    'connect-src': ["'self'", ...(options.connectOrigins ?? [])],
    'worker-src': ["'self'"],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
    'frame-ancestors': ["'none'"],
    ...(options.https ? { 'upgrade-insecure-requests': [] } : {}),
  });
}

/** Policy for worker scripts (see WORKER_PATH_PATTERN). */
export function workerContentSecurityPolicy(): string {
  return join({
    'default-src': ["'none'"],
    // Module workers import their own chunks; the test runner needs eval.
    'script-src': ["'self'", "'unsafe-eval'"],
    'connect-src': ["'none'"],
  });
}

/** Headers other than CSP, identical for every response. */
export function commonSecurityHeaders(options: WebSecurityOptions = {}): Record<string, string> {
  return {
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'referrer-policy': 'strict-origin-when-cross-origin',
    'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
    'cross-origin-opener-policy': 'same-origin',
    ...(options.https
      ? { 'strict-transport-security': 'max-age=63072000; includeSubDomains' }
      : {}),
  };
}

/** All headers for a static file at `path` (as the local server sends them). */
export function securityHeadersFor(
  path: string,
  options: WebSecurityOptions = {},
): Record<string, string> {
  return {
    ...commonSecurityHeaders(options),
    'content-security-policy': isWorkerPath(path)
      ? workerContentSecurityPolicy()
      : appContentSecurityPolicy(options),
  };
}
