import { computed, inject, Injectable, InjectionToken, signal } from '@angular/core';
import { type AuthConfig, RuntimeConfigService } from '../config/runtime-config';
import { codeChallenge, randomString, readJwtPayload, safeReturnPath } from './pkce';

/** Where the browser goes; replaceable in tests. */
export const NAVIGATOR = new InjectionToken<(url: string) => void>('NAVIGATOR', {
  providedIn: 'root',
  factory: () => (url: string) => window.location.assign(url),
});

export const CALLBACK_PATH = '/auth/callback';
const TOKENS_KEY = 'pracstack:auth:tokens';
const PENDING_KEY = 'pracstack:auth:pending';
/** Refresh this long before the ID token expires. */
const EXPIRY_MARGIN_MS = 60_000;

interface StoredTokens {
  readonly idToken: string;
  readonly refreshToken?: string;
  /** Epoch ms. */
  readonly expiresAt: number;
}

interface PendingSignIn {
  readonly state: string;
  readonly verifier: string;
  readonly returnPath: string;
}

export type AuthStatus = 'local' | 'signed-out' | 'signed-in';

export class SignInError extends Error {
  override readonly name = 'SignInError';
}

/*
 * Tokens are kept in sessionStorage: they survive reloads in the tab, are
 * dropped when it closes, and are never sent anywhere except our own API.
 * Any script running in the page could read them, which is why the app ships
 * with a strict Content-Security-Policy (no inline or third-party script).
 * Cognito's own session cookie makes signing in again a single redirect.
 */
const session = {
  read<T>(key: string): T | undefined {
    try {
      const raw = sessionStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : undefined;
    } catch {
      return undefined;
    }
  },
  write(key: string, value: unknown): void {
    try {
      sessionStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* storage disabled */
    }
  },
  remove(key: string): void {
    try {
      sessionStorage.removeItem(key);
    } catch {
      /* storage disabled */
    }
  },
};

/**
 * Sign-in with Amazon Cognito managed login: OAuth 2.0 authorization code
 * flow with PKCE, for a public client (no secret). In local mode there is no
 * sign-in; the local API treats every request as the local developer.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly runtime = inject(RuntimeConfigService);
  private readonly navigate = inject(NAVIGATOR);
  private readonly tokens = signal<StoredTokens | undefined>(session.read(TOKENS_KEY));
  private refreshing: Promise<StoredTokens | undefined> | undefined;

  readonly status = computed<AuthStatus>(() => {
    if (this.runtime.config().auth.mode === 'local') return 'local';
    return this.tokens() ? 'signed-in' : 'signed-out';
  });

  /** True when API calls are possible (local mode, or signed in). */
  readonly canUseApi = computed(() => this.status() !== 'signed-out');

  /** Starts sign-in; the browser leaves the app and returns to the callback. */
  async signIn(returnPath = currentPath()): Promise<void> {
    const auth = this.cognito();
    const pending: PendingSignIn = {
      state: randomString(),
      verifier: randomString(),
      returnPath: safeReturnPath(returnPath),
    };
    session.write(PENDING_KEY, pending);
    const url = new URL('/oauth2/authorize', auth.domain);
    url.search = new URLSearchParams({
      response_type: 'code',
      client_id: auth.clientId,
      redirect_uri: redirectUri(),
      scope: 'openid email profile',
      state: pending.state,
      code_challenge: await codeChallenge(pending.verifier),
      code_challenge_method: 'S256',
    }).toString();
    this.navigate(url.toString());
  }

  /**
   * Starts sign-in if needed. Returns true when the API can be used now;
   * false when the browser is being sent to sign in.
   */
  ensureSignedIn(returnPath?: string): boolean {
    if (this.canUseApi()) return true;
    void this.signIn(returnPath);
    return false;
  }

  /** Handles the redirect back from Cognito. Returns the path to continue at. */
  async completeSignIn(params: URLSearchParams): Promise<string> {
    const auth = this.cognito();
    const pending = session.read<PendingSignIn>(PENDING_KEY);
    session.remove(PENDING_KEY);
    const error = params.get('error');
    if (error) throw new SignInError(params.get('error_description') ?? error);
    const code = params.get('code');
    if (!pending || !code || params.get('state') !== pending.state) {
      // Not started by this tab, replayed, or forged: never exchange the code.
      throw new SignInError('This sign-in link is invalid or has expired. Please sign in again.');
    }
    const tokens = await this.tokenRequest(auth, {
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri(),
      code_verifier: pending.verifier,
    });
    if (!tokens) throw new SignInError('Sign-in could not be completed. Please try again.');
    return pending.returnPath;
  }

  /** A current ID token for the API, refreshed when about to expire. */
  async idToken(): Promise<string | undefined> {
    const tokens = this.tokens();
    if (!tokens) return undefined;
    if (tokens.expiresAt - EXPIRY_MARGIN_MS > Date.now()) return tokens.idToken;
    this.refreshing ??= this.refresh(tokens).finally(() => (this.refreshing = undefined));
    return (await this.refreshing)?.idToken;
  }

  /** Called when the API rejects the token: forget it (the user can sign in again). */
  sessionExpired(): void {
    this.store(undefined);
  }

  /** Display name from the ID token (unverified; display only). */
  readonly displayName = computed(() => {
    const token = this.tokens()?.idToken;
    const claims = token ? readJwtPayload(token) : undefined;
    const name = claims?.['name'] ?? claims?.['email'];
    return typeof name === 'string' ? name : undefined;
  });

  signOut(): void {
    const auth = this.runtime.config().auth;
    this.store(undefined);
    if (auth.mode !== 'cognito') return;
    const url = new URL('/logout', auth.domain);
    url.search = new URLSearchParams({
      client_id: auth.clientId,
      logout_uri: new URL('/', window.location.origin).toString(),
    }).toString();
    this.navigate(url.toString());
  }

  private async refresh(tokens: StoredTokens): Promise<StoredTokens | undefined> {
    const auth = this.runtime.config().auth;
    if (auth.mode !== 'cognito' || !tokens.refreshToken) {
      this.store(undefined);
      return undefined;
    }
    const refreshed = await this.tokenRequest(
      auth,
      { grant_type: 'refresh_token', refresh_token: tokens.refreshToken },
      tokens.refreshToken,
    );
    if (!refreshed) this.store(undefined);
    return refreshed;
  }

  private async tokenRequest(
    auth: Extract<AuthConfig, { mode: 'cognito' }>,
    params: Record<string, string>,
    keepRefreshToken?: string,
  ): Promise<StoredTokens | undefined> {
    let body: Record<string, unknown>;
    try {
      const res = await fetch(new URL('/oauth2/token', auth.domain), {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_id: auth.clientId, ...params }).toString(),
      });
      if (!res.ok) return undefined;
      body = (await res.json()) as Record<string, unknown>;
    } catch {
      return undefined;
    }
    const idToken = body['id_token'];
    const expiresIn = Number(body['expires_in']);
    if (typeof idToken !== 'string' || !Number.isFinite(expiresIn)) return undefined;
    const refreshToken =
      typeof body['refresh_token'] === 'string' ? body['refresh_token'] : keepRefreshToken;
    const tokens: StoredTokens = {
      idToken,
      ...(refreshToken ? { refreshToken } : {}),
      expiresAt: Date.now() + expiresIn * 1000,
    };
    this.store(tokens);
    return tokens;
  }

  private store(tokens: StoredTokens | undefined): void {
    if (tokens) session.write(TOKENS_KEY, tokens);
    else session.remove(TOKENS_KEY);
    this.tokens.set(tokens);
  }

  private cognito(): Extract<AuthConfig, { mode: 'cognito' }> {
    const auth = this.runtime.config().auth;
    if (auth.mode !== 'cognito') throw new SignInError('Sign-in is not configured.');
    return auth;
  }
}

const redirectUri = (): string => new URL(CALLBACK_PATH, window.location.origin).toString();
const currentPath = (): string =>
  window.location.pathname + window.location.search + window.location.hash;
