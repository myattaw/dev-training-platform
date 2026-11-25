import {
  type CreateWebRunRequest,
  type CreateWebSessionRequest,
  type CreateWebTimedSessionRequest,
  type SaveWebDraftRequest,
  WEB_TIMED_DURATIONS,
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
  if (mode !== 'visible' && mode !== 'submit') throw badRequest('"mode" must be visible or submit.');
  return {
    framework: parseFramework(b['framework']),
    files: parseFiles(b['files']),
    mode,
    ...(b['timedSessionId'] !== undefined
      ? { timedSessionId: parseUuid(b['timedSessionId'], 'timedSessionId') }
      : {}),
  };
}

export function parseCreateWebSession(body: unknown): CreateWebSessionRequest {
  const b = obj(body);
  return {
    challengeId: parseId(b['challengeId'], 'challengeId'),
    framework: parseFramework(b['framework']),
    files: parseFiles(b['files']),
  };
}

export function parseSaveWebDraft(body: unknown): SaveWebDraftRequest {
  const b = obj(body);
  const version = b['challengeVersion'];
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1 || version > 10_000) {
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
