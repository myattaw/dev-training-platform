/**
 * OAuth 2.0 authorization code flow with PKCE (RFC 7636) helpers, for a
 * public client with no secret.
 */

export function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** A high-entropy random string (32 random bytes, base64url). */
export function randomString(): string {
  return base64Url(crypto.getRandomValues(new Uint8Array(32)));
}

/** S256 code challenge for a verifier. */
export async function codeChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64Url(new Uint8Array(digest));
}

/**
 * Reads the payload of a JWT WITHOUT verifying it. Only for display (name,
 * expiry hints): the API verifies every token it receives.
 */
export function readJwtPayload(token: string): Record<string, unknown> | undefined {
  const part = token.split('.')[1];
  if (!part) return undefined;
  try {
    const json = atob(part.replace(/-/g, '+').replace(/_/g, '/'));
    const bytes = Uint8Array.from(json, (c) => c.charCodeAt(0));
    const value: unknown = JSON.parse(new TextDecoder().decode(bytes));
    return value && typeof value === 'object' ? (value as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

/** A same-origin path to return to after sign-in; anything else becomes `/`. */
export function safeReturnPath(path: string | null | undefined): string {
  return path && path.startsWith('/') && !path.startsWith('//') && !path.includes('\\')
    ? path
    : '/';
}
