import {
  CODE_LIMITS,
  type CreateInterviewSessionRequest,
  type CreatePlanRequest,
  type FinishInterviewRequest,
  type ImportedDraft,
  INTERVIEW_DURATIONS,
  type InterviewDuration,
  PREPARATION_LIMITS,
  PROFILE_LIMITS,
  type ProgressImportRequest,
  type ReportedQuestionStatus,
  PLAN_KEY_PATTERN,
  type PlanSettings,
  type SavedRequirement,
  type SavedScheduleDay,
  type UpdatePlanRequest,
} from '@pracstack/api-contracts';
import {
  INTERVIEW_FORMATS,
  type InterviewFormat,
  LANGUAGE_LABELS,
  type LanguageId,
  type PreparationPriority,
  REQUIREMENT_LABELS,
  type RequirementLevel,
} from '@pracstack/content-model';
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
  const name = cleanText(value);
  if (name.length < 1 || name.length > PROFILE_LIMITS.maxDisplayName) {
    throw badRequest(`"displayName" must be 1–${PROFILE_LIMITS.maxDisplayName} characters.`);
  }
  return name;
}

/** User-chosen text: control characters removed, whitespace collapsed, trimmed. */
function cleanText(value: string): string {
  return (
    value
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u001f\u007f]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

/** `{ roleId }`: a role id, or null to clear the target. */
export function parseSetTargetRole(body: unknown): string | null {
  const o = asObject(body);
  if (!Object.hasOwn(o, 'roleId')) throw badRequest('"roleId" is required (a role id or null).');
  const roleId = o['roleId'];
  return roleId === null ? null : parseId(roleId, 'roleId');
}

const PLAN_FIELDS = new Set([
  'title',
  'termIds',
  'settings',
  'requirements',
  'schedule',
  'done',
  'skipped',
]);
const UPDATE_FIELDS = new Set(['title', 'settings', 'requirements', 'schedule', 'done', 'skipped']);
const SETTINGS_FIELDS = new Set([
  'jobTitle',
  'company',
  'interviewDate',
  'dailyMinutes',
  'format',
  'language',
]);
const REQUIREMENT_FIELDS = new Set(['termId', 'requirement', 'priority']);
const REQUIREMENT_LEVELS = new Set<string>(Object.keys(REQUIREMENT_LABELS));
const PRIORITIES = new Set<string>(['high', 'medium', 'low']);
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function onlyFields(o: Record<string, unknown>, allowed: ReadonlySet<string>, what: string): void {
  const extra = Object.keys(o).filter((k) => !allowed.has(k));
  if (extra.length > 0) {
    throw badRequest(`${what} does not accept "${extra[0]}". Plans never store job posting text.`);
  }
}

function parseTitle(value: unknown): string {
  if (typeof value !== 'string') throw badRequest('"title" must be a string.');
  const title = cleanText(value);
  if (title.length < 1 || title.length > PREPARATION_LIMITS.maxPlanTitle) {
    throw badRequest(`"title" must be 1–${PREPARATION_LIMITS.maxPlanTitle} characters.`);
  }
  return title;
}

function parseDate(value: unknown, field: string): string {
  if (
    typeof value !== 'string' ||
    !DATE.test(value) ||
    Number.isNaN(Date.parse(`${value}T00:00:00Z`))
  ) {
    throw badRequest(`"${field}" must be a date (YYYY-MM-DD).`);
  }
  return value;
}

function parseSettings(value: unknown): PlanSettings {
  const o = asObject(value);
  onlyFields(o, SETTINGS_FIELDS, '"settings"');
  const format = o['format'];
  if (typeof format !== 'string' || !(INTERVIEW_FORMATS as readonly string[]).includes(format)) {
    throw badRequest('"settings.format" must be an interview format.');
  }
  const text = (field: 'jobTitle' | 'company'): string | undefined => {
    const v = o[field];
    if (v === undefined) return undefined;
    if (typeof v !== 'string') throw badRequest(`"settings.${field}" must be a string.`);
    const t = cleanText(v);
    if (t.length > PREPARATION_LIMITS.maxSettingText) {
      throw badRequest(
        `"settings.${field}" must be at most ${PREPARATION_LIMITS.maxSettingText} characters.`,
      );
    }
    return t === '' ? undefined : t;
  };
  const jobTitle = text('jobTitle');
  const company = text('company');
  const interviewDate =
    o['interviewDate'] === undefined
      ? undefined
      : parseDate(o['interviewDate'], 'settings.interviewDate');
  const minutes = o['dailyMinutes'];
  if (
    minutes !== undefined &&
    (typeof minutes !== 'number' || !Number.isInteger(minutes) || minutes < 15 || minutes > 720)
  ) {
    throw badRequest('"settings.dailyMinutes" must be a whole number from 15 to 720.');
  }
  const language = o['language'] === undefined ? undefined : parseLanguage(o['language']);
  return {
    format: format as InterviewFormat,
    ...(jobTitle ? { jobTitle } : {}),
    ...(company ? { company } : {}),
    ...(interviewDate ? { interviewDate } : {}),
    ...(typeof minutes === 'number' ? { dailyMinutes: minutes } : {}),
    ...(language ? { language } : {}),
  };
}

function parseRequirements(value: unknown): SavedRequirement[] {
  if (!Array.isArray(value) || value.length > PREPARATION_LIMITS.maxPlanTerms) {
    throw badRequest(
      `"requirements" must be a list of at most ${PREPARATION_LIMITS.maxPlanTerms}.`,
    );
  }
  const seen = new Set<string>();
  return value.map((item: unknown, i) => {
    const o = asObject(item);
    onlyFields(o, REQUIREMENT_FIELDS, `"requirements[${i}]"`);
    const termId = parseId(o['termId'], `requirements[${i}].termId`);
    if (seen.has(termId)) throw badRequest(`"requirements" lists "${termId}" twice.`);
    seen.add(termId);
    const requirement = o['requirement'];
    const priority = o['priority'];
    if (typeof requirement !== 'string' || !REQUIREMENT_LEVELS.has(requirement)) {
      throw badRequest(`"requirements[${i}].requirement" is not a requirement level.`);
    }
    if (typeof priority !== 'string' || !PRIORITIES.has(priority)) {
      throw badRequest(`"requirements[${i}].priority" must be high, medium or low.`);
    }
    return {
      termId,
      requirement: requirement as RequirementLevel,
      priority: priority as PreparationPriority,
    };
  });
}

function parseKey(value: unknown, field: string): string {
  if (
    typeof value !== 'string' ||
    value.length > PREPARATION_LIMITS.maxKeyLength ||
    !PLAN_KEY_PATTERN.test(value)
  ) {
    throw badRequest(`"${field}" is not a plan activity key.`);
  }
  return value;
}

function parseKeys(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.length > PREPARATION_LIMITS.maxMarks) {
    throw badRequest(`"${field}" must be a list of at most ${PREPARATION_LIMITS.maxMarks} keys.`);
  }
  return [...new Set(value.map((k: unknown, i) => parseKey(k, `${field}[${i}]`)))];
}

function parseSchedule(value: unknown): SavedScheduleDay[] {
  if (!Array.isArray(value) || value.length > PREPARATION_LIMITS.maxScheduleDays) {
    throw badRequest(
      `"schedule" must be a list of at most ${PREPARATION_LIMITS.maxScheduleDays} days.`,
    );
  }
  let previous = '';
  return value.map((day: unknown, i) => {
    const o = asObject(day);
    onlyFields(o, new Set(['date', 'items']), `"schedule[${i}]"`);
    const date = parseDate(o['date'], `schedule[${i}].date`);
    if (date <= previous) throw badRequest('"schedule" days must be in date order, once each.');
    previous = date;
    const items = o['items'];
    if (!Array.isArray(items) || items.length > PREPARATION_LIMITS.maxItemsPerDay) {
      throw badRequest(
        `"schedule[${i}].items" must be a list of at most ${PREPARATION_LIMITS.maxItemsPerDay}.`,
      );
    }
    return {
      date,
      items: items.map((item: unknown, j) => {
        const it = asObject(item);
        onlyFields(it, new Set(['key', 'minutes']), `"schedule[${i}].items[${j}]"`);
        const minutes = it['minutes'];
        if (
          typeof minutes !== 'number' ||
          !Number.isInteger(minutes) ||
          minutes < 0 ||
          minutes > 720
        ) {
          throw badRequest(`"schedule[${i}].items[${j}].minutes" must be 0–720.`);
        }
        return { key: parseKey(it['key'], `schedule[${i}].items[${j}].key`), minutes };
      }),
    };
  });
}

function parseTermIds(value: unknown): string[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > PREPARATION_LIMITS.maxPlanTerms) {
    throw badRequest(
      `"termIds" must be a list of 1–${PREPARATION_LIMITS.maxPlanTerms} taxonomy term ids.`,
    );
  }
  return [...new Set(value.map((id: unknown, i) => parseId(id, `termIds[${i}]`)))];
}

/**
 * A new plan: title and term ids, optionally settings, requirements, a
 * schedule and marks. Any other field is refused, so job posting text cannot
 * be stored even by a modified client.
 */
export function parseCreatePlan(body: unknown): CreatePlanRequest {
  const o = asObject(body);
  onlyFields(o, PLAN_FIELDS, 'A plan');
  return {
    title: parseTitle(o['title']),
    termIds: parseTermIds(o['termIds']),
    ...(o['settings'] !== undefined ? { settings: parseSettings(o['settings']) } : {}),
    ...(o['requirements'] !== undefined
      ? { requirements: parseRequirements(o['requirements']) }
      : {}),
    ...(o['schedule'] !== undefined ? { schedule: parseSchedule(o['schedule']) } : {}),
    ...(o['done'] !== undefined ? { done: parseKeys(o['done'], 'done') } : {}),
    ...(o['skipped'] !== undefined ? { skipped: parseKeys(o['skipped'], 'skipped') } : {}),
  };
}

/** Changes to a plan; only the fields given change. `schedule: null` removes the schedule. */
export function parseUpdatePlan(body: unknown): UpdatePlanRequest {
  const o = asObject(body);
  onlyFields(o, UPDATE_FIELDS, 'A plan update');
  if (Object.keys(o).length === 0) throw badRequest('Nothing to update.');
  return {
    ...(o['title'] !== undefined ? { title: parseTitle(o['title']) } : {}),
    ...(o['settings'] !== undefined ? { settings: parseSettings(o['settings']) } : {}),
    ...(o['requirements'] !== undefined
      ? { requirements: parseRequirements(o['requirements']) }
      : {}),
    ...(o['schedule'] === null
      ? { schedule: null }
      : o['schedule'] !== undefined
        ? { schedule: parseSchedule(o['schedule']) }
        : {}),
    ...(o['done'] !== undefined ? { done: parseKeys(o['done'], 'done') } : {}),
    ...(o['skipped'] !== undefined ? { skipped: parseKeys(o['skipped'], 'skipped') } : {}),
  };
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
