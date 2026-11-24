import type { UserInfo } from '@pracstack/api-contracts';
import { ApiError, type ApiRequest } from './http';

/**
 * The authenticated caller. Beyond the public {@link UserInfo}, it carries
 * facts only the server may see: where the identity comes from and its
 * verified groups. Never built from client input.
 */
export interface Caller extends UserInfo {
  /** Identity provider (the token issuer), for mapping to the internal user id. */
  readonly provider?: string;
  /** The provider's subject (user id). */
  readonly subject?: string;
  /**
   * How the person signed in to Cognito: a federated provider's name ("Google",
   * "GitHub") from the token's `identities` claim; absent for email and password.
   * A label only: identities are keyed by provider and subject.
   */
  readonly method?: string;
  /** Verified groups, e.g. Cognito groups (`admins`). */
  readonly groups?: readonly string[];
}

/** Resolves the caller. */
export interface Authenticator {
  readonly kind: 'local-dev' | 'jwt';
  /** Throws `ApiError('unauthorized')` when the request is not authenticated. */
  authenticate(request: ApiRequest): Promise<Caller>;
}

export const LOCAL_DEV_USER: UserInfo = {
  id: 'local-dev',
  displayName: 'Local developer',
  mode: 'local-dev',
};

/**
 * Treats every request as the same local developer. There is no
 * authentication at all, so this must only run on a loopback interface
 * during development. `createApi` refuses it unless explicitly allowed.
 */
export class LocalDevAuthenticator implements Authenticator {
  readonly kind = 'local-dev';

  authenticate(): Promise<Caller> {
    return Promise.resolve(LOCAL_DEV_USER);
  }
}

export interface VerifiedJwtOptions {
  /** Token issuer, e.g. `https://cognito-idp.<region>.amazonaws.com/<userPoolId>`. */
  readonly issuer: string;
  /** App client ID the token must be issued for. */
  readonly audience: string;
}

/**
 * Users signed in with Amazon Cognito.
 *
 * The signature, expiry, issuer and audience of the ID token are verified by
 * the API Gateway JWT authorizer before the Lambda function runs, and the
 * function can only be invoked through that API. This authenticator reads the
 * verified claims the adapter passes on, and re-checks issuer, audience, token
 * use and expiry as defense in depth (a misconfigured authorizer fails closed).
 */
export class VerifiedJwtAuthenticator implements Authenticator {
  readonly kind = 'jwt';

  constructor(
    private readonly options: VerifiedJwtOptions,
    private readonly now: () => Date = () => new Date(),
  ) {}

  authenticate(request: ApiRequest): Promise<Caller> {
    const claims = request.verifiedClaims;
    const unauthorized = () => new ApiError('unauthorized', 'Sign in to continue.');
    if (!claims) return Promise.reject(unauthorized());

    const str = (key: string): string | undefined => {
      const value = claims[key];
      return typeof value === 'string' && value !== '' ? value : undefined;
    };
    const sub = str('sub');
    const exp = Number(claims['exp']);
    const valid =
      sub !== undefined &&
      str('iss') === this.options.issuer &&
      str('aud') === this.options.audience &&
      str('token_use') === 'id' &&
      Number.isFinite(exp) &&
      exp * 1000 > this.now().getTime();
    if (!valid) return Promise.reject(unauthorized());

    const email = str('email');
    return Promise.resolve({
      id: sub,
      displayName: str('name') ?? email ?? 'Signed-in user',
      mode: 'authenticated',
      provider: this.options.issuer,
      subject: sub,
      ...signInMethod(claims['identities']),
      groups: parseGroups(claims['cognito:groups']),
    });
  }
}

/**
 * Cognito puts groups in `cognito:groups`. API Gateway's JWT authorizer passes
 * array claims as a string like `[admins editors]`; tests and other adapters
 * may pass a real array. Anything else means no groups.
 */
export function parseGroups(value: unknown): readonly string[] {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string');
  if (typeof value !== 'string') return [];
  return value
    .replace(/^\[|\]$/g, '')
    .split(/[\s,]+/)
    .filter((g) => /^[\w.-]+$/.test(g));
}

/** The federated provider of a Cognito ID token (`identities` claim), when there is one. */
export function signInMethod(identities: unknown): { method?: string } {
  const list = typeof identities === 'string' ? safeJson(identities) : identities;
  const name = Array.isArray(list)
    ? (list[0] as { providerName?: unknown } | undefined)?.providerName
    : undefined;
  return typeof name === 'string' && /^[A-Za-z0-9 ._-]{1,32}$/.test(name) ? { method: name } : {};
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
