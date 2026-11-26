import {
  type CreateWebRunRequest,
  type CreateWebTimedSessionRequest,
  type SaveWebDraftRequest,
  WEB_REQUEST_LIMITS,
  WEB_TIMED_DURATIONS,
  type WebHttpRequest,
  type WebTimedDuration,
} from '@pracstack/api-contracts';
import { WEB_FRAMEWORKS, type WebFramework } from '@pracstack/content-model';
import { badRequest } from '../http';
import { parseUuid } from '../prep-validation';
import { parseId } from '../validation';

/*
 * Runtime validation of web-challenge request bodies (the browser is never
 * trusted). File contents are validated against the challenge's editable
 * paths by the service (validateSubmittedFiles); here only the shape.
 */

const obj = (body: unknown): Record<string, unknown> => {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw badRequest('A JSON object is required.');
  }
  return body as Record<string, unknown>;
};

export function parseFramework(value: unknown): WebFramework {
  if (typeof value !== 'string' || !(WEB_FRAMEWORKS as readonly string[]).includes(value)) {
    throw badRequest(`"framework" must be one of: ${WEB_FRAMEWORKS.join(', ')}.`);
  }
  return value as WebFramework;
}

function parseFiles(value: unknown): Readonly<Record<string, string>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw badRequest('"files" must be an object of path → content.');
  }
  return value as Record<string, string>;
}

export function parseCreateWebRun(body: unknown): CreateWebRunRequest {
  const b = obj(body);
  const mode = b['mode'];
  if (mode !== 'visible' && mode !== 'submit' && mode !== 'requests')
    throw badRequest('"mode" must be visible, submit or requests.');
  if (mode !== 'requests' && b['requests'] !== undefined) {
    throw badRequest('"requests" are only sent with mode "requests".');
  }
  return {
    framework: parseFramework(b['framework']),
    files: parseFiles(b['files']),
    mode,
    ...(mode === 'requests' ? { requests: parseWebHttpRequests(b['requests']) } : {}),
    ...(b['timedSessionId'] !== undefined
      ? { timedSessionId: parseUuid(b['timedSessionId'], 'timedSessionId') }
      : {}),
  };
}

const HEADER_NAME =
  /^(content-type|accept|authorization|if-match|if-none-match|x-[a-z0-9-]{1,40})$/i;
const REQUEST_PATH = /^\/(?!\/)[A-Za-z0-9\-._~!$&'()*+,;=:@%/?]{0,2047}$/;

/** The HTTP client's requests (never trusted): count, then each one, then total size. */
export function parseWebHttpRequests(value: unknown): readonly WebHttpRequest[] {
  const max = WEB_REQUEST_LIMITS.maxRequests;
  if (!Array.isArray(value) || value.length === 0 || value.length > max) {
    throw badRequest(`"requests" must be a list of 1 to ${max} requests.`);
  }
  const requests = value.map((r, i) => parseWebHttpRequest(r, i + 1));
  const total = requests.reduce((n, r) => n + Buffer.byteLength(r.body ?? ''), 0);
  if (total > WEB_REQUEST_LIMITS.maxTotalBodyBytes) {
    throw badRequest(
      `The request bodies add up to more than ${WEB_REQUEST_LIMITS.maxTotalBodyBytes / 1024} KB.`,
    );
  }
  return requests;
}

/** One request: method, relative path, approved headers, body size. */
export function parseWebHttpRequest(body: unknown, n = 1): WebHttpRequest {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw badRequest(`Request ${n} must be an object.`);
  }
  const b = body as Record<string, unknown>;
  const method = b['method'];
  if (
    method !== 'GET' &&
    method !== 'POST' &&
    method !== 'PUT' &&
    method !== 'PATCH' &&
    method !== 'DELETE'
  ) {
    throw badRequest(`Request ${n}: method must be GET, POST, PUT, PATCH or DELETE.`);
  }
  const path = b['path'];
  if (typeof path !== 'string' || !REQUEST_PATH.test(path) || path.includes('\\')) {
    throw badRequest(
      `Request ${n}: the path must be a relative application path such as /api/employees (no URLs).`,
    );
  }
  const headers: Record<string, string> = {};
  if (b['headers'] !== undefined) {
    if (typeof b['headers'] !== 'object' || b['headers'] === null || Array.isArray(b['headers'])) {
      throw badRequest(`Request ${n}: headers must be an object.`);
    }
    const entries = Object.entries(b['headers'] as Record<string, unknown>);
    if (entries.length > WEB_REQUEST_LIMITS.maxHeaders) {
      throw badRequest(
        `Request ${n}: at most ${WEB_REQUEST_LIMITS.maxHeaders} headers are allowed.`,
      );
    }
    for (const [name, value] of entries) {
      if (!HEADER_NAME.test(name)) {
        throw badRequest(
          `Request ${n}: header "${name.slice(0, 64)}" is not allowed. Allowed: Content-Type, Accept, Authorization, If-Match, If-None-Match and X-… headers.`,
        );
      }
      if (typeof value !== 'string' || value.length > 1024 || /[\r\n\0]/.test(value)) {
        throw badRequest(
          `Request ${n}: header "${name}" must be a single line of at most 1024 characters.`,
        );
      }
      headers[name] = value;
    }
  }
  const requestBody = b['body'];
  if (requestBody !== undefined && requestBody !== null) {
    if (
      typeof requestBody !== 'string' ||
      Buffer.byteLength(requestBody) > WEB_REQUEST_LIMITS.maxBodyBytes
    ) {
      throw badRequest(
        `Request ${n}: the body must be text of at most ${WEB_REQUEST_LIMITS.maxBodyBytes / 1024} KB.`,
      );
    }
  }
  return {
    method,
    path,
    ...(Object.keys(headers).length ? { headers } : {}),
    ...(typeof requestBody === 'string' ? { body: requestBody } : {}),
  };
}

export function parseSaveWebDraft(body: unknown): SaveWebDraftRequest {
  const b = obj(body);
  const version = b['challengeVersion'];
  if (
    typeof version !== 'number' ||
    !Number.isInteger(version) ||
    version < 1 ||
    version > 10_000
  ) {
    throw badRequest('"challengeVersion" must be a positive integer.');
  }
  return { challengeVersion: version, files: parseFiles(b['files']) };
}

export function parseCreateWebTimedSession(body: unknown): CreateWebTimedSessionRequest {
  const b = obj(body);
  const duration = b['durationMinutes'];
  if (!(WEB_TIMED_DURATIONS as readonly unknown[]).includes(duration)) {
    throw badRequest(`"durationMinutes" must be one of: ${WEB_TIMED_DURATIONS.join(', ')}.`);
  }
  return {
    challengeId: parseId(b['challengeId'], 'challengeId'),
    framework: parseFramework(b['framework']),
    durationMinutes: duration as WebTimedDuration,
  };
}
