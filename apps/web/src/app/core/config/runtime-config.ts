import { Injectable, signal } from '@angular/core';

/**
 * Deployment settings, read at startup from `/config.json` (not compiled into
 * the bundle, so one build runs everywhere). Locally the file in
 * `apps/web/public` selects local mode; on AWS the CDK stack writes it with
 * the Cognito settings. Contains no secrets: everything here is public.
 */
export type AuthConfig =
  /** The local API's unauthenticated developer user. */
  | { readonly mode: 'local' }
  | {
      readonly mode: 'cognito';
      /** Cognito managed-login origin, e.g. `https://pracstack-x.auth.us-east-2.amazoncognito.com`. */
      readonly domain: string;
      /** Public app client (no secret; PKCE). */
      readonly clientId: string;
    };

export interface RuntimeConfig {
  readonly auth: AuthConfig;
}

export const LOCAL_CONFIG: RuntimeConfig = { auth: { mode: 'local' } };

export function isRuntimeConfig(value: unknown): value is RuntimeConfig {
  const auth = (value as { auth?: Record<string, unknown> } | null)?.auth;
  if (!auth) return false;
  if (auth['mode'] === 'local') return true;
  return (
    auth['mode'] === 'cognito' &&
    typeof auth['domain'] === 'string' &&
    /^https:\/\/[a-z0-9.-]+$/.test(auth['domain']) &&
    typeof auth['clientId'] === 'string' &&
    auth['clientId'] !== ''
  );
}

@Injectable({ providedIn: 'root' })
export class RuntimeConfigService {
  private readonly state = signal<RuntimeConfig>(LOCAL_CONFIG);
  readonly config = this.state.asReadonly();

  /** Loads `/config.json`. A missing or invalid file falls back to local mode. */
  async load(): Promise<void> {
    try {
      const res = await fetch(new URL('config.json', document.baseURI), { cache: 'no-cache' });
      const value: unknown = res.ok ? await res.json() : undefined;
      if (isRuntimeConfig(value)) this.state.set(value);
      else console.error('Ignoring invalid config.json; using local mode.');
    } catch {
      // Unreachable or not JSON: local development without the file.
    }
  }

  /** For tests. */
  set(config: RuntimeConfig): void {
    this.state.set(config);
  }
}
