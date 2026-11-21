import {
  ANSWER_LIMITS,
  type AnswerPayload,
  type ChallengeCodeRequest,
  CODE_LIMITS,
  type AnswerRequest,
  type HintRequest,
  type NextQuestionRequest,
  type RunSqlRequest,
} from '@pracstack/api-contracts';
import { ID_PATTERN, LANGUAGE_LABELS, type LanguageId } from '@pracstack/content-model';
import { badRequest } from './http';

/*
 * Runtime validation of request bodies. Request types are not trusted: every
 * field is checked for type, length and format before use. Unknown fields
 * are ignored.
 */

const TOKEN_PATTERN = /^[0-9a-f-]{36}$/;
const MAX_ID_LENGTH = 100;

function asObject(value: unknown, what: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw badRequest(`${what} must be a JSON object.`);
  }
  return value as Record<string, unknown>;
}

export function parseId(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length > MAX_ID_LENGTH || !ID_PATTERN.test(value)) {
    throw badRequest(`"${field}" must be a valid id.`);
  }
  return value;
}

function parseToken(value: unknown): string {
  if (typeof value !== 'string' || !TOKEN_PATTERN.test(value)) {
    throw badRequest('"token" must be a question token.');
  }
  return value;
}

function parseString(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== 'string') throw badRequest(`"${field}" must be a string.`);
  if (value.length > maxLength) {
    throw badRequest(`"${field}" must be at most ${maxLength} characters.`);
  }
  return value;
}

export function parseNextQuestionRequest(body: unknown): NextQuestionRequest {
  const o = asObject(body, 'Request body');
  return { skillId: parseId(o['skillId'], 'skillId') };
}

export function parseHintRequest(body: unknown): HintRequest {
  const o = asObject(body, 'Request body');
  return { token: parseToken(o['token']) };
}

export function parseAnswerRequest(body: unknown): AnswerRequest {
  const o = asObject(body, 'Request body');
  return { token: parseToken(o['token']), answer: parseAnswer(o['answer']) };
}

export function parseChallengeCodeRequest(body: unknown): ChallengeCodeRequest {
  const o = asObject(body, 'Request body');
  const language = o['language'];
  if (typeof language !== 'string' || !(language in LANGUAGE_LABELS)) {
    throw badRequest(`"language" must be one of: ${Object.keys(LANGUAGE_LABELS).join(', ')}.`);
  }
  const code = parseString(o['code'], 'code', CODE_LIMITS.maxCodeLength);
  if (code.trim() === '') throw badRequest('Write some code first.');
  return { language: language as LanguageId, code };
}

export function parseRunSqlRequest(body: unknown): RunSqlRequest {
  const o = asObject(body, 'Request body');
  return {
    token: parseToken(o['token']),
    query: parseString(o['query'], 'query', ANSWER_LIMITS.maxQueryLength),
  };
}

function parseAnswer(value: unknown): AnswerPayload {
  const o = asObject(value, '"answer"');
  switch (o['format']) {
    case 'multiple-choice': {
      const selected = o['selected'];
      if (!Array.isArray(selected) || selected.length > ANSWER_LIMITS.maxSelected) {
        throw badRequest(
          `"selected" must be a list of at most ${ANSWER_LIMITS.maxSelected} option ids.`,
        );
      }
      const ids = selected.map((s, i) => parseString(s, `selected[${i}]`, MAX_ID_LENGTH));
      return { format: 'multiple-choice', selected: [...new Set(ids)] };
    }
    case 'predict-output':
      return {
        format: 'predict-output',
        output: parseString(o['output'], 'output', ANSWER_LIMITS.maxOutputLength),
      };
    case 'fill-in-blank': {
      const raw = asObject(o['blanks'], '"blanks"');
      const entries = Object.entries(raw);
      if (entries.length > 20) throw badRequest('Too many blanks.');
      const blanks: Record<string, string> = {};
      for (const [id, v] of entries) {
        blanks[parseId(id, 'blank id')] = parseString(
          v,
          `blanks.${id}`,
          ANSWER_LIMITS.maxBlankLength,
        );
      }
      return { format: 'fill-in-blank', blanks };
    }
    case 'sql-query':
      return {
        format: 'sql-query',
        query: parseString(o['query'], 'query', ANSWER_LIMITS.maxQueryLength),
      };
    default:
      throw badRequest(
        '"answer.format" must be multiple-choice, predict-output, fill-in-blank or sql-query.',
      );
  }
}
