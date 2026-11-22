import { inject, Injectable, isDevMode } from '@angular/core';
import { AuthService } from '../auth/auth.service';
import type { ApiErrorBody, ApiErrorCode } from '@pracstack/api-contracts';

export type ClientErrorCode = ApiErrorCode | 'unavailable';

/** An API failure with a message that is safe to show. */
export class ApiClientError extends Error {
  override readonly name = 'ApiClientError';
  constructor(
    readonly code: ClientErrorCode,
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

/**
 * Minimal JSON client for the PracStack API (`/api/*`, same origin; the dev
 * server proxies it to the local API). Abstract so tests can substitute a fake.
 */
export abstract class ApiClient {
  abstract get<T>(path: string, query?: Record<string, string>): Promise<T>;
  abstract post<T>(path: string, body: unknown): Promise<T>;
  abstract put<T>(path: string, body: unknown): Promise<T>;
  abstract patch<T>(path: string, body: unknown): Promise<T>;
  abstract delete<T>(path: string): Promise<T>;
}

@Injectable()
export class FetchApiClient extends ApiClient {
  private readonly auth = inject(AuthService);

  override get<T>(path: string, query: Record<string, string> = {}): Promise<T> {
    const search = new URLSearchParams(query).toString();
    return this.request<T>('GET', search ? `${path}?${search}` : path);
  }

  override post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>('POST', path, body);
  }

  override put<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>('PUT', path, body);
  }

  override patch<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>('PATCH', path, body);
  }

  override delete<T>(path: string): Promise<T> {
    return this.request<T>('DELETE', path);
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = new URL(`api/${path.replace(/^\//, '')}`, document.baseURI);
    const headers: Record<string, string> =
      body === undefined ? {} : { 'content-type': 'application/json' };
    if (this.auth.status() !== 'local') {
      const token = await this.auth.idToken();
      if (!token) throw new ApiClientError('unauthorized', 'Sign in to continue.', 401);
      headers['authorization'] = `Bearer ${token}`;
    }
    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw unavailable();
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      // A dev-server proxy error page, for example.
      throw response.ok
        ? new ApiClientError('internal', 'The server sent an invalid response.')
        : unavailable();
    }
    if (response.status === 401 && this.auth.status() === 'signed-in') this.auth.sessionExpired();
    if (!response.ok) {
      const error = (payload as Partial<ApiErrorBody>).error;
      if (error?.code && error.message)
        throw new ApiClientError(error.code, error.message, response.status);
      // API Gateway's JWT authorizer answers 401 in its own format.
      if (response.status === 401)
        throw new ApiClientError('unauthorized', 'Sign in to continue.', 401);
      const gatewayError = [502, 503, 504].includes(response.status);
      throw gatewayError
        ? unavailable()
        : new ApiClientError('internal', 'Something went wrong.', response.status);
    }
    return payload as T;
  }
}

function unavailable(): ApiClientError {
  const message = 'The practice service could not be reached. Check your connection and try again.';
  return new ApiClientError(
    'unavailable',
    isDevMode()
      ? `${message} (Local development: is the API running? Start everything with "npm start".)`
      : message,
  );
}
