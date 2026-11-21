import type {
  APIGatewayProxyEventV2WithJWTAuthorizer,
  APIGatewayProxyStructuredResultV2,
} from 'aws-lambda';
import type { ApiHandler } from '../app';
import { type ApiResponse, MAX_REQUEST_BODY_BYTES } from '../http';

/** Every API response is JSON, never cached, never sniffed. */
const BASE_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
};

const error = (status: number, code: string, message: string): ApiResponse => ({
  status,
  body: { error: { code, message } },
});

/**
 * Adapts an API Gateway HTTP API (payload v2) event to the transport-neutral
 * API. JWT claims are taken only from `requestContext.authorizer`, which API
 * Gateway fills in after verifying the token; clients cannot set it.
 */
export function createLambdaHandler(api: ApiHandler) {
  return async (
    event: APIGatewayProxyEventV2WithJWTAuthorizer,
  ): Promise<APIGatewayProxyStructuredResultV2> => {
    const parsed = parseBody(event);
    const response =
      'error' in parsed
        ? parsed.error
        : await api({
            method: event.requestContext.http.method,
            path: event.rawPath,
            query: { ...event.queryStringParameters } as Record<string, string>,
            headers: event.headers,
            body: parsed.body,
            ...(event.requestContext.authorizer?.jwt?.claims
              ? { verifiedClaims: event.requestContext.authorizer.jwt.claims }
              : {}),
          });
    return {
      statusCode: response.status,
      headers: { ...BASE_HEADERS, ...response.headers },
      body: JSON.stringify(response.body),
    };
  };
}

function parseBody(
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
): { body: unknown } | { error: ApiResponse } {
  if (event.body === undefined || event.body === '') return { body: undefined };
  const raw = event.isBase64Encoded ? Buffer.from(event.body, 'base64') : Buffer.from(event.body);
  if (raw.length > MAX_REQUEST_BODY_BYTES) {
    return {
      error: error(
        413,
        'bad-request',
        `Request body must be at most ${MAX_REQUEST_BODY_BYTES / 1024} KB.`,
      ),
    };
  }
  try {
    return { body: JSON.parse(raw.toString('utf8')) as unknown };
  } catch {
    return { error: error(400, 'bad-request', 'Request body is not valid JSON.') };
  }
}
