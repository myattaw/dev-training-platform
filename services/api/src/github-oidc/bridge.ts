import { createHash, createPublicKey, type KeyObject, sign } from 'node:crypto';

/*
 * GitHub sign-in for Cognito: a minimal OpenID Connect provider that wraps
 * GitHub OAuth (GitHub OAuth Apps are not OIDC providers: no ID token, no
 * discovery). Cognito talks to it like any OIDC provider; it talks to GitHub.
 * See docs/accounts-and-auth.md, "GitHub sign-in".
 *
 * Security-relevant choices:
 * - It stores no GitHub secret. Cognito sends the GitHub app's client ID and
 *   secret to /token (as any OIDC client does), and they are passed to GitHub.
 * - /authorize only redirects to GitHub with a redirect URI on the allowlist
 *   (Cognito's /oauth2/idpresponse), so it cannot be used as an open redirect.
 * - The ID token's email is GitHub's *primary, verified* address only. A
 *   GitHub account can list addresses its owner never verified; using one of
 *   those could sign someone into another person's PracStack account.
 * - The subject is GitHub's numeric user ID, which never changes (logins can).
 * - ID tokens are RS256-signed with a key only this function can read, live
 *   for 5 minutes, and are audience-bound to the client ID Cognito sent.
 */

export interface SigningKey {
  readonly privateKey: KeyObject;
  /** Key ID published in the JWKS and the token header. */
  readonly kid: string;
}

export interface BridgeConfig {
  /** Public URL of this provider, e.g. https://api.example.com/oidc/github (no trailing slash). */
  readonly issuer: string;
  /** Redirect URIs /authorize and /token accept: Cognito's /oauth2/idpresponse. */
  readonly allowedRedirectUris: readonly string[];
  readonly signingKey: () => Promise<SigningKey>;
  readonly fetch: typeof fetch;
  /** Milliseconds since the epoch. */
  readonly now: () => number;
  readonly github?: { readonly web: string; readonly api: string };
}

export interface BridgeRequest {
  readonly method: string;
  /** Path below the issuer, e.g. `/token`. */
  readonly path: string;
  readonly query: Readonly<Record<string, string>>;
  /** Lower-case header names. */
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string;
}

export interface BridgeResponse {
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string;
}

const GITHUB = { web: 'https://github.com', api: 'https://api.github.com' };
const ID_TOKEN_SECONDS = 300;
const GITHUB_SCOPES = 'read:user user:email';
const USER_AGENT = 'PracStack-OIDC-bridge';

/** A key ID derived from the public key, so it changes when the key does. */
export function keyIdOf(privateKey: KeyObject): string {
  const der = createPublicKey(privateKey).export({ type: 'spki', format: 'der' });
  return createHash('sha256').update(der).digest('base64url').slice(0, 16);
}

const json = (
  status: number,
  body: unknown,
  extra: Record<string, string> = {},
): BridgeResponse => ({
  status,
  headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...extra },
  body: JSON.stringify(body),
});

const oauthError = (status: number, error: string, description: string): BridgeResponse =>
  json(status, { error, error_description: description });

const b64url = (value: string | Buffer) => Buffer.from(value).toString('base64url');

/** Claims about a GitHub user, as an OIDC provider states them. */
export interface GitHubClaims {
  readonly sub: string;
  readonly email: string;
  readonly email_verified: true;
  readonly name: string;
  readonly preferred_username: string;
}

class GitHubError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export function createGithubBridge(
  config: BridgeConfig,
): (req: BridgeRequest) => Promise<BridgeResponse> {
  const github = config.github ?? GITHUB;
  const issuer = config.issuer.replace(/\/+$/, '');

  async function githubJson(path: string, token: string): Promise<unknown> {
    const res = await config.fetch(`${github.api}${path}`, {
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${token}`,
        'user-agent': USER_AGENT,
        'x-github-api-version': '2022-11-28',
      },
    });
    if (res.status === 401)
      throw new GitHubError(401, 'invalid_token', 'GitHub rejected the token.');
    if (!res.ok) throw new GitHubError(502, 'server_error', `GitHub returned ${res.status}.`);
    return res.json();
  }

  /** The user's ID, names and primary verified email, straight from GitHub. */
  async function claimsFor(token: string): Promise<GitHubClaims> {
    const [user, emails] = await Promise.all([
      githubJson('/user', token) as Promise<{ id?: unknown; login?: unknown; name?: unknown }>,
      githubJson('/user/emails', token) as Promise<unknown>,
    ]);
    if (typeof user.id !== 'number' || typeof user.login !== 'string') {
      throw new GitHubError(502, 'server_error', 'GitHub returned an unexpected user.');
    }
    const primary = Array.isArray(emails)
      ? (emails as { email?: unknown; primary?: unknown; verified?: unknown }[]).find(
          (e) => e.primary === true && e.verified === true && typeof e.email === 'string',
        )
      : undefined;
    if (!primary) {
      throw new GitHubError(
        400,
        'access_denied',
        'Your GitHub account has no verified primary email address. Verify it on GitHub, then try again.',
      );
    }
    return {
      sub: String(user.id),
      email: String(primary.email).toLowerCase(),
      email_verified: true,
      name: typeof user.name === 'string' && user.name.trim() !== '' ? user.name : user.login,
      preferred_username: user.login,
    };
  }

  async function idToken(claims: GitHubClaims, audience: string): Promise<string> {
    const key = await config.signingKey();
    const iat = Math.floor(config.now() / 1000);
    const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: key.kid }));
    const payload = b64url(
      JSON.stringify({ iss: issuer, aud: audience, iat, exp: iat + ID_TOKEN_SECONDS, ...claims }),
    );
    const signature = sign('RSA-SHA256', Buffer.from(`${header}.${payload}`), key.privateKey);
    return `${header}.${payload}.${b64url(signature)}`;
  }

  function discovery(): BridgeResponse {
    return json(
      200,
      {
        issuer,
        authorization_endpoint: `${issuer}/authorize`,
        token_endpoint: `${issuer}/token`,
        userinfo_endpoint: `${issuer}/userinfo`,
        jwks_uri: `${issuer}/jwks.json`,
        response_types_supported: ['code'],
        subject_types_supported: ['public'],
        id_token_signing_alg_values_supported: ['RS256'],
        scopes_supported: ['openid', 'email', 'profile'],
        token_endpoint_auth_methods_supported: ['client_secret_post', 'client_secret_basic'],
        claims_supported: ['sub', 'email', 'email_verified', 'name', 'preferred_username'],
      },
      { 'cache-control': 'public, max-age=300' },
    );
  }

  async function jwks(): Promise<BridgeResponse> {
    const key = await config.signingKey();
    const jwk = createPublicKey(key.privateKey).export({ format: 'jwk' });
    return json(
      200,
      { keys: [{ ...jwk, kid: key.kid, alg: 'RS256', use: 'sig' }] },
      { 'cache-control': 'public, max-age=300' },
    );
  }

  function authorize(query: Readonly<Record<string, string>>): BridgeResponse {
    const clientId = query['client_id'] ?? '';
    const redirectUri = query['redirect_uri'] ?? '';
    const state = query['state'] ?? '';
    if (!/^[A-Za-z0-9_.-]{1,100}$/.test(clientId)) {
      return oauthError(400, 'invalid_request', 'Missing or invalid client_id.');
    }
    if (!config.allowedRedirectUris.includes(redirectUri)) {
      return oauthError(400, 'invalid_request', 'redirect_uri is not allowed.');
    }
    if ((query['response_type'] ?? 'code') !== 'code') {
      return oauthError(400, 'unsupported_response_type', 'Only the code flow is supported.');
    }
    const url = new URL(`${github.web}/login/oauth/authorize`);
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('scope', GITHUB_SCOPES);
    if (state) url.searchParams.set('state', state);
    return {
      status: 302,
      headers: { location: url.toString(), 'cache-control': 'no-store' },
      body: '',
    };
  }

  async function token(req: BridgeRequest): Promise<BridgeResponse> {
    const form = new URLSearchParams(req.body);
    let clientId = form.get('client_id') ?? '';
    let clientSecret = form.get('client_secret') ?? '';
    const basic = /^Basic\s+(.+)$/i.exec(req.headers['authorization'] ?? '');
    if (basic?.[1]) {
      const [id, secret] = Buffer.from(basic[1], 'base64').toString('utf8').split(':');
      clientId = decodeURIComponent(id ?? '');
      clientSecret = decodeURIComponent(secret ?? '');
    }
    if (form.get('grant_type') !== 'authorization_code') {
      return oauthError(400, 'unsupported_grant_type', 'Only authorization_code is supported.');
    }
    const code = form.get('code') ?? '';
    const redirectUri = form.get('redirect_uri') ?? '';
    if (!clientId || !clientSecret || !code) {
      return oauthError(400, 'invalid_request', 'client credentials and code are required.');
    }
    if (redirectUri && !config.allowedRedirectUris.includes(redirectUri)) {
      return oauthError(400, 'invalid_request', 'redirect_uri is not allowed.');
    }
    const exchange = await config.fetch(`${github.web}/login/oauth/access_token`, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/x-www-form-urlencoded',
        'user-agent': USER_AGENT,
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        ...(redirectUri ? { redirect_uri: redirectUri } : {}),
      }).toString(),
    });
    if (!exchange.ok) return oauthError(502, 'server_error', `GitHub returned ${exchange.status}.`);
    const result = (await exchange.json()) as { access_token?: unknown; error?: unknown };
    if (typeof result.access_token !== 'string') {
      // GitHub answers 200 with { error } for a bad code or bad client credentials.
      return oauthError(400, 'invalid_grant', 'GitHub did not accept the code or the client.');
    }
    const claims = await claimsFor(result.access_token);
    return json(200, {
      access_token: result.access_token,
      token_type: 'Bearer',
      expires_in: 3600,
      scope: 'openid email profile',
      id_token: await idToken(claims, clientId),
    });
  }

  async function userinfo(req: BridgeRequest): Promise<BridgeResponse> {
    const bearer = /^Bearer\s+(\S+)$/i.exec(req.headers['authorization'] ?? '')?.[1];
    if (!bearer) {
      return json(
        401,
        { error: 'invalid_token' },
        { 'www-authenticate': 'Bearer error="invalid_token"' },
      );
    }
    return json(200, await claimsFor(bearer));
  }

  return async (req) => {
    try {
      const path = req.path.replace(/\/+$/, '') || '/';
      const method = req.method.toUpperCase();
      if (method === 'GET' && path === '/.well-known/openid-configuration') return discovery();
      if (method === 'GET' && path === '/jwks.json') return await jwks();
      if (method === 'GET' && path === '/authorize') return authorize(req.query);
      if (method === 'POST' && path === '/token') return await token(req);
      if ((method === 'GET' || method === 'POST') && path === '/userinfo')
        return await userinfo(req);
      return json(404, { error: 'not_found' });
    } catch (err) {
      if (err instanceof GitHubError) {
        return err.status === 401
          ? json(401, { error: err.code, error_description: err.message })
          : oauthError(err.status, err.code, err.message);
      }
      return oauthError(500, 'server_error', 'The GitHub sign-in bridge failed.');
    }
  };
}
