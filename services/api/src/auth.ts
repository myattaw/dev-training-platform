import type { UserInfo } from '@pracstack/api-contracts';
import type { ApiRequest } from './http';

/**
 * Resolves the caller. Phase 6 adds a Cognito JWT authenticator; the API
 * logic does not change.
 */
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
