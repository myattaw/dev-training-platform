import type { HttpTestStep, JsonAssertion, WebTest } from './web-challenge';

/**
 * Grades the raw HTTP responses of a web-challenge run against its tests.
 * Runs on the trusted side only (the API, and the content build's checks):
 * responses are untrusted data produced by learner code.
 *
 * JSON is compared semantically: property order never matters, numbers
 * compare by value, and object keys also match case-insensitively (so
 * `errors.Name` satisfies `errors.name`), because frameworks differ in
 * casing conventions that are not the point of a challenge.
 */

/** The parts of a response grading needs (see ProbeResponse in @pracstack/web-runner). */
export interface HttpResponseLike {
  readonly status?: number;
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: string;
  readonly error?: string;
}

export interface WebStepResult {
  readonly passed: boolean;
  /** e.g. `POST /api/employees` */
  readonly request: string;
  /** What the test wanted, e.g. `status 201; json id is a number`. */
  readonly expected: string;
  /** What came back (bounded), when there was a response. */
  readonly actual?: string;
  /** Why the step failed. */
  readonly message?: string;
}

export interface WebTestResult {
  readonly id: string;
  readonly description: string;
  readonly category: string;
  readonly passed: boolean;
  /** Steps up to and including the first failure. */
  readonly steps: readonly WebStepResult[];
}

export function gradeWebTest(
  test: WebTest,
  responses: readonly (HttpResponseLike | undefined)[],
): WebTestResult {
  const steps: WebStepResult[] = [];
  for (const [i, step] of test.steps.entries()) {
    const result = gradeStep(step, responses[i]);
    steps.push(result);
    if (!result.passed) break;
  }
  return {
    id: test.id,
    description: test.description,
    category: test.category,
    passed: steps.length === test.steps.length && steps.every((s) => s.passed),
    steps,
  };
}

export function describeStep(step: HttpTestStep): { request: string; expected: string } {
  const statuses = Array.isArray(step.expect.status) ? step.expect.status : [step.expect.status];
  const parts = [`status ${statuses.join(' or ')}`];
  for (const a of step.expect.json ?? []) parts.push(describeAssertion(a));
  for (const h of step.expect.headers ?? []) {
    parts.push(h.matches ? `header ${h.name} matches ${h.matches}` : `header ${h.name} present`);
  }
  return { request: `${step.request.method} ${step.request.path}`, expected: parts.join('; ') };
}

function gradeStep(step: HttpTestStep, response: HttpResponseLike | undefined): WebStepResult {
  const { request, expected } = describeStep(step);
  const fail = (message: string, actual?: string): WebStepResult => ({
    passed: false,
    request,
    expected,
    message,
    ...(actual !== undefined ? { actual } : {}),
  });
  if (!response || response.status === undefined) {
    return fail(response?.error ?? 'No response from the application.');
  }
  const actual = `${response.status} ${truncate(response.body ?? '', 400)}`.trim();
  const statuses = Array.isArray(step.expect.status) ? step.expect.status : [step.expect.status];
  if (!statuses.includes(response.status)) {
    return fail(`Expected status ${statuses.join(' or ')} but got ${response.status}.`, actual);
  }
  for (const h of step.expect.headers ?? []) {
    const value = headerValue(response.headers ?? {}, h.name);
    if (value === undefined) return fail(`Missing header ${h.name}.`, actual);
    if (h.matches !== undefined && !new RegExp(h.matches).test(value)) {
      return fail(`Header ${h.name} is "${truncate(value, 200)}", which does not match ${h.matches}.`, actual);
    }
  }
  if (step.expect.json && step.expect.json.length > 0) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(response.body ?? '');
    } catch {
      return fail('The response body is not valid JSON.', actual);
    }
    for (const assertion of step.expect.json) {
      const problem = checkAssertion(parsed, assertion);
      if (problem) return fail(problem, actual);
    }
  }
  return { passed: true, request, expected, actual };
}

const MISSING = Symbol('missing');

/** Reads a dot path: object keys (exact, then case-insensitive), array indexes, `length`. */
export function readPath(value: unknown, path: string): unknown {
  if (path === '' || path === '$') return value;
  let current: unknown = value;
  for (const key of path.split('.')) {
    if (current === null || current === undefined) return MISSING;
    if (Array.isArray(current)) {
      if (key === 'length') current = current.length;
      else if (/^\d+$/.test(key)) current = Number(key) < current.length ? current[Number(key)] : MISSING;
      else return MISSING;
    } else if (typeof current === 'string' && key === 'length') {
      current = current.length;
    } else if (typeof current === 'object') {
      const record = current as Record<string, unknown>;
      if (Object.prototype.hasOwnProperty.call(record, key)) current = record[key];
      else {
        const match = Object.keys(record).find((k) => k.toLowerCase() === key.toLowerCase());
        current = match === undefined ? MISSING : record[match];
      }
    } else {
      return MISSING;
    }
    if (current === MISSING) return MISSING;
  }
  return current;
}

function checkAssertion(json: unknown, a: JsonAssertion): string | undefined {
  const value = readPath(json, a.path);
  const where = a.path === '' ? 'the response' : `"${a.path}"`;
  if ('exists' in a) {
    const exists = value !== MISSING;
    return exists === a.exists ? undefined : a.exists ? `${where} is missing.` : `${where} should not be present.`;
  }
  if (value === MISSING) return `${where} is missing.`;
  if ('equals' in a) {
    return semanticEqual(value, a.equals)
      ? undefined
      : `Expected ${where} to be ${show(a.equals)} but it is ${show(value)}.`;
  }
  if ('type' in a) {
    return typeOf(value) === a.type ? undefined : `Expected ${where} to be ${article(a.type)} but it is ${typeOf(value)}.`;
  }
  if (!Array.isArray(value)) return `Expected ${where} to be an array but it is ${typeOf(value)}.`;
  const subset = 'contains' in a ? a.contains : a.notContains;
  const found = value.some((item) => matchesSubset(item, subset));
  if ('contains' in a) {
    return found ? undefined : `Expected ${where} to include an item with ${show(subset)}.`;
  }
  return found ? `Expected ${where} not to include an item with ${show(subset)}.` : undefined;
}

function matchesSubset(item: unknown, subset: Readonly<Record<string, unknown>>): boolean {
  if (item === null || typeof item !== 'object' || Array.isArray(item)) return false;
  return Object.entries(subset).every(([key, expected]) => {
    const actual = readPath(item, key);
    return actual !== MISSING && semanticEqual(actual, expected);
  });
}

/** Deep equality ignoring property order; object keys also match case-insensitively. */
export function semanticEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a === 'number' && typeof b === 'number') return a === b;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((x, i) => semanticEqual(x, b[i]));
  }
  const ra = a as Record<string, unknown>;
  const rb = b as Record<string, unknown>;
  const keysA = Object.keys(ra);
  const keysB = Object.keys(rb);
  if (keysA.length !== keysB.length) return false;
  return keysB.every((key) => {
    const match = Object.prototype.hasOwnProperty.call(ra, key)
      ? key
      : keysA.find((k) => k.toLowerCase() === key.toLowerCase());
    return match !== undefined && semanticEqual(ra[match], rb[key]);
  });
}

function typeOf(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

const article = (type: string): string => (/^[aeiou]/.test(type) ? `an ${type}` : `a ${type}`);

function describeAssertion(a: JsonAssertion): string {
  const where = a.path === '' ? 'body' : a.path;
  if ('exists' in a) return a.exists ? `json ${where} present` : `json ${where} absent`;
  if ('equals' in a) return `json ${where} = ${show(a.equals)}`;
  if ('type' in a) return `json ${where} is ${article(a.type)}`;
  if ('contains' in a) return `json ${where} includes ${show(a.contains)}`;
  return `json ${where} excludes ${show(a.notContains)}`;
}

function headerValue(headers: Readonly<Record<string, string>>, name: string): string | undefined {
  const key = Object.keys(headers).find((k) => k.toLowerCase() === name.toLowerCase());
  return key === undefined ? undefined : headers[key];
}

function show(value: unknown): string {
  try {
    return truncate(JSON.stringify(value) ?? String(value), 200);
  } catch {
    return String(value);
  }
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}
