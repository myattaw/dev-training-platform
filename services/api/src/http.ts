import type { ApiErrorBody, ApiErrorCode } from '@pracstack/api-contracts';

/**
 * Transport-neutral request/response types. The local Node server and (later)
 * the AWS Lambda handler both adapt their native events to these, so all API
 * logic is shared and tested once.
 */
export interface ApiRequest {
  readonly method: string;
  /** Path without query string, e.g. `/api/me`. */
  readonly path: string;
  readonly query: Readonly<Record<string, string>>;
  readonly headers: Readonly<Record<string, string | undefined>>;
  /** Parsed JSON body, or `undefined` when there is none. */
  readonly body: unknown;
}

export interface ApiResponse {
  readonly status: number;
  readonly body: unknown;
  readonly headers?: Readonly<Record<string, string>>;
}

const STATUS: Readonly<Record<ApiErrorCode, number>> = {
  'bad-request': 400,
  unauthorized: 401,
  'not-found': 404,
  conflict: 409,
  'token-expired': 410,
  'rate-limited': 429,
  internal: 500,
  unavailable: 503,
};

/** An error whose message is safe to show to the learner. */
export class ApiError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    message: string,
    readonly headers?: Readonly<Record<string, string>>,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  get status(): number {
    return STATUS[this.code];
  }

  toResponse(): ApiResponse {
    const body: ApiErrorBody = { error: { code: this.code, message: this.message } };
    return { status: this.status, body, ...(this.headers ? { headers: this.headers } : {}) };
  }
}

export const badRequest = (message: string): ApiError => new ApiError('bad-request', message);
export const notFound = (message: string): ApiError => new ApiError('not-found', message);
