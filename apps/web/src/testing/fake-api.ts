import type { Provider } from '@angular/core';
import type { MeResponse } from '@pracstack/api-contracts';
import { ApiClient, ApiClientError } from '../app/core/api/api-client';

type Handler = (input: unknown) => unknown;

/**
 * In-memory stand-in for the API. Handlers are keyed by "METHOD /path"
 * (path without the /api prefix and without query string). Unhandled calls
 * fail like an unreachable server.
 */
export class FakeApiClient extends ApiClient {
  readonly calls: { readonly route: string; readonly input: unknown }[] = [];

  constructor(private readonly handlers: Record<string, Handler> = {}) {
    super();
  }

  has(route: string): boolean {
    return route in this.handlers;
  }

  on(route: string, handler: Handler): this {
    this.handlers[route] = handler;
    return this;
  }

  override get<T>(path: string, query: Record<string, string> = {}): Promise<T> {
    return this.dispatch<T>(`GET ${path}`, query);
  }

  override post<T>(path: string, body: unknown): Promise<T> {
    return this.dispatch<T>(`POST ${path}`, body);
  }

  private async dispatch<T>(route: string, input: unknown): Promise<T> {
    this.calls.push({ route, input });
    const handler = this.handlers[route];
    if (!handler)
      throw new ApiClientError('unavailable', 'The practice service could not be reached.');
    return (await handler(input)) as T;
  }
}

export const FAKE_ME: MeResponse = {
  user: { id: 'local-dev', displayName: 'Local developer', mode: 'local-dev' },
  xp: 0,
};

export function provideFakeApi(api: FakeApiClient = new FakeApiClient()): Provider {
  if (!api.has('GET /me')) api.on('GET /me', () => FAKE_ME);
  return { provide: ApiClient, useValue: api };
}
