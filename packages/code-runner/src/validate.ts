import type { RawOutcome } from '@pracstack/challenge-runtime';
import {
  type CodeRunRequest,
  type CodeRunResult,
  type CompileDiagnostic,
  RUNNER_LANGUAGES,
  type RunnerLanguage,
} from './protocol';

/*
 * Everything that comes back from a runner is untrusted: the learner's code
 * ran there, and could have tampered with the harness. These checks make sure
 * a result has the right shape and bounded size before the API grades it. (A
 * forged result can only claim outputs; it never sees the expected values,
 * so it cannot make a test pass that the code would not pass.)
 */

const MAX_TEXT = 10_000;
const MAX_ITEMS = 1_000;
const MAX_LOG_LINE = 2_000;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isText = (v: unknown, max = MAX_TEXT): v is string =>
  typeof v === 'string' && v.length <= max;
const isList = (v: unknown, max = MAX_ITEMS): v is unknown[] => Array.isArray(v) && v.length <= max;
const isInt = (v: unknown): v is number => Number.isSafeInteger(v);

/** JSON values as encoded by `encodeValue`, with a depth bound. */
function isEncoded(v: unknown, depth = 0): boolean {
  if (depth > 60) return false;
  if (v === null || typeof v === 'boolean' || typeof v === 'number') return true;
  if (typeof v === 'string') return v.length <= 100_000;
  if (Array.isArray(v)) return v.length <= 100_000 && v.every((x) => isEncoded(x, depth + 1));
  if (isObj(v)) return Object.values(v).every((x) => isEncoded(x, depth + 1));
  return false;
}

function isOutcome(v: unknown): v is RawOutcome {
  if (!isObj(v)) return false;
  if (v['kind'] === 'call') {
    return (
      (v['value'] === undefined || isEncoded(v['value'])) &&
      (v['error'] === undefined || isText(v['error']))
    );
  }
  if (v['kind'] === 'operations') {
    const error = v['error'];
    return (
      isList(v['values']) &&
      v['values'].every((x) => isEncoded(x)) &&
      (error === undefined || (isObj(error) && isInt(error['step']) && isText(error['message'])))
    );
  }
  return false;
}

const isLogs = (v: unknown): v is string[] => isList(v) && v.every((l) => isText(l, MAX_LOG_LINE));

const isDiagnostic = (v: unknown): v is CompileDiagnostic =>
  isObj(v) && isInt(v['line']) && isInt(v['column']) && isText(v['message']);

/** A valid `CodeRunResult`, or undefined. `testCount` must match the request. */
export function parseCodeRunResult(value: unknown, testCount: number): CodeRunResult | undefined {
  if (!isObj(value)) return undefined;
  switch (value['kind']) {
    case 'completed': {
      const outcomes = value['outcomes'];
      if (!isList(outcomes) || outcomes.length !== testCount || !outcomes.every(isOutcome))
        return undefined;
      if (!isLogs(value['logs'])) return undefined;
      return { kind: 'completed', outcomes, logs: value['logs'] };
    }
    case 'compile-error': {
      const diagnostics = value['diagnostics'];
      if (!isList(diagnostics, 200) || !diagnostics.every(isDiagnostic)) return undefined;
      return { kind: 'compile-error', diagnostics };
    }
    case 'load-error':
      if (!isText(value['message']) || !isLogs(value['logs'])) return undefined;
      return { kind: 'load-error', message: value['message'], logs: value['logs'] };
    case 'timeout':
      return isInt(value['timeoutMs'])
        ? { kind: 'timeout', timeoutMs: value['timeoutMs'] }
        : undefined;
    case 'resource-limit':
    case 'unavailable':
      return isText(value['message'], 500)
        ? { kind: value['kind'], message: value['message'] }
        : undefined;
    default:
      return undefined;
  }
}

/** Validates a request arriving at a runner function (it comes from the API, via IAM). */
export function parseCodeRunRequest(value: unknown): CodeRunRequest | undefined {
  if (!isObj(value)) return undefined;
  const { language, code, entryPoint, tests } = value;
  if (typeof language !== 'string' || !(RUNNER_LANGUAGES as readonly string[]).includes(language)) {
    return undefined;
  }
  if (!isText(code, 100_000) || !isText(entryPoint, 200) || !isList(tests, 500)) return undefined;
  return {
    language: language as RunnerLanguage,
    code,
    entryPoint,
    tests: tests as CodeRunRequest['tests'],
  };
}
