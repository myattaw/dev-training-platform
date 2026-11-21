import type { UserInfo } from '@pracstack/api-contracts';
import { ApiError, type ApiRequest } from './http';

/** Resolves the caller. */
export interface Authenticator {
  readonly kind: 'local-dev' | 'jwt';
  /** Throws `ApiError('unauthorized')` when the request is not authenticated. */
  authenticate(request: ApiRequest): Promise<UserInfo>;
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

  authenticate(): Promise<UserInfo> {
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
 * use and expiry as defence in depth (a misconfigured authorizer fails closed).
 */
export class VerifiedJwtAuthenticator implements Authenticator {
  readonly kind = 'jwt';

  constructor(
    private readonly options: VerifiedJwtOptions,
    private readonly now: () => Date = () => new Date(),
  ) {}

  authenticate(request: ApiRequest): Promise<UserInfo> {
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
    });
  }
}
