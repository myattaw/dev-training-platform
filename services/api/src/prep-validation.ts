import {
  CODE_LIMITS,
  type CreateInterviewSessionRequest,
  type FinishInterviewRequest,
  type ImportedDraft,
  INTERVIEW_DURATIONS,
  type InterviewDuration,
  PROFILE_LIMITS,
  type ProgressImportRequest,
  type ReportedQuestionStatus,
} from '@pracstack/api-contracts';
import { LANGUAGE_LABELS, type LanguageId } from '@pracstack/content-model';
import { badRequest } from './http';
import { parseId } from './validation';
import type { CompanyQuery } from './companies/company-service';

/*
 * Runtime validation for account, company and interview requests. Bodies
 * are untrusted: every field is checked; unknown fields are ignored (so a
 * client cannot set `plan`, `userId`, `deadline` or `startedAt`).
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const QUESTION_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*:[1-9][0-9]{0,5}$/;
const MAX_QUERY = 100;
const MAX_PAGE = 1000;

function asObject(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw badRequest('Request body must be a JSON object.');
  }
  return value as Record<string, unknown>;
}

export function parseUuid(value: unknown, field: string): string {
  if (typeof value !== 'string' || !UUID.test(value)) {
    throw badRequest(`"${field}" must be a UUID.`);
  }
  return value;
}

export function parseLanguage(value: unknown): LanguageId {
  if (typeof value !== 'string' || !Object.hasOwn(LANGUAGE_LABELS, value)) {
    throw badRequest(`"language" must be one of: ${Object.keys(LANGUAGE_LABELS).join(', ')}.`);
  }
  return value as LanguageId;
}

export function parseCompanyQuery(query: Readonly<Record<string, string>>): CompanyQuery {
  const q = query['q'] ?? '';
  if (q.length > MAX_QUERY) throw badRequest(`"q" must be at most ${MAX_QUERY} characters.`);
  const letter = query['letter'];
  if (letter !== undefined && !/^[A-Z#]$/.test(letter)) {
    throw badRequest('"letter" must be a capital letter A–Z or #.');
  }
  const pageText = query['page'] ?? '1';
  const page = Number(pageText);
  if (!/^[1-9][0-9]*$/.test(pageText) || page > MAX_PAGE) {
    throw badRequest(`"page" must be a whole number from 1 to ${MAX_PAGE}.`);
  }
  return { q, ...(letter !== undefined ? { letter } : {}), page };
}

export function parseQuestionId(value: string): string {
  if (!QUESTION_ID.test(value)) throw badRequest('"questionId" must be a question reference id.');
  return value;
}

const QUESTION_STATUSES: readonly ReportedQuestionStatus[] = [
  'not-started',
  'reviewed-externally',
  'solved-externally',
];

export function parseQuestionStatus(body: unknown): ReportedQuestionStatus {
  const status = asObject(body)['status'];
  if (!QUESTION_STATUSES.includes(status as ReportedQuestionStatus)) {
    throw badRequest(`"status" must be one of: ${QUESTION_STATUSES.join(', ')}.`);
  }
  return status as ReportedQuestionStatus;
}

/** Display name: trimmed, control characters removed, 1–60 characters. */
export function parseDisplayName(body: unknown): string {
  const value = asObject(body)['displayName'];
  if (typeof value !== 'string') throw badRequest('"displayName" must be a string.');
  const name = value
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (name.length < 1 || name.length > PROFILE_LIMITS.maxDisplayName) {
    throw badRequest(`"displayName" must be 1–${PROFILE_LIMITS.maxDisplayName} characters.`);
  }
  return name;
}

export function parseProgressImport(body: unknown): ProgressImportRequest {
  const o = asObject(body);
  const importId = parseUuid(o['importId'], 'importId');
  const drafts = o['drafts'];
  if (!Array.isArray(drafts) || drafts.length > PROFILE_LIMITS.maxImportDrafts) {
    throw badRequest(`"drafts" must be a list of at most ${PROFILE_LIMITS.maxImportDrafts}.`);
  }
  const parsed: ImportedDraft[] = drafts.map((d, i) => {
    const draft = asObject(d);
    const code = draft['code'];
    if (typeof code !== 'string' || code.length > CODE_LIMITS.maxCodeLength) {
      throw badRequest(
        `"drafts[${i}].code" must be a string of at most ${CODE_LIMITS.maxCodeLength} characters.`,
      );
    }
    const updatedAt = draft['updatedAt'];
    if (
      typeof updatedAt !== 'string' ||
      Number.isNaN(Date.parse(updatedAt)) ||
      updatedAt.length > 40
    ) {
      throw badRequest(`"drafts[${i}].updatedAt" must be an ISO date.`);
    }
    return {
      challengeId: parseId(draft['challengeId'], `drafts[${i}].challengeId`),
      language: parseLanguage(draft['language']),
      code,
      updatedAt: new Date(updatedAt).toISOString(),
    };
  });
  const overwrite = o['overwrite'] ?? [];
  if (
    !Array.isArray(overwrite) ||
    overwrite.length > PROFILE_LIMITS.maxImportDrafts ||
    !overwrite.every((k) => typeof k === 'string' && /^[a-z0-9-]{1,100}:(typescript|java)$/.test(k))
  ) {
    throw badRequest('"overwrite" must be a list of "<challengeId>:<language>" keys.');
  }
  return { importId, drafts: parsed, overwrite: overwrite as string[] };
}

export function parseCreateInterviewSession(body: unknown): CreateInterviewSessionRequest {
  const o = asObject(body);
  const duration = o['durationMinutes'];
  if (!INTERVIEW_DURATIONS.includes(duration as InterviewDuration)) {
    throw badRequest(`"durationMinutes" must be one of: ${INTERVIEW_DURATIONS.join(', ')}.`);
  }
  return {
    companySlug: parseId(o['companySlug'], 'companySlug'),
    challengeId: parseId(o['challengeId'], 'challengeId'),
    durationMinutes: duration as InterviewDuration,
    language: parseLanguage(o['language']),
    clientRequestId: parseUuid(o['clientRequestId'], 'clientRequestId'),
  };
}

export function parseFinishInterview(body: unknown): FinishInterviewRequest {
  const outcome = asObject(body)['outcome'];
  if (outcome !== 'completed' && outcome !== 'abandoned') {
    throw badRequest('"outcome" must be completed or abandoned.');
  }
  return { outcome };
}
