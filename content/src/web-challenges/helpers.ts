import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  HeaderAssertion,
  HttpTestStep,
  JsonAssertion,
  WebImplementationSource,
  WebTest,
} from '@pracstack/content-model';

/**
 * Authoring helpers for Web Development Challenges. Starter and reference
 * projects are real files on disk next to each challenge:
 *
 *   <challenge>/<framework>/starter/**    the whole starter project
 *   <challenge>/<framework>/reference/**  reference versions of editable files
 *   <challenge>/<framework>/mutants/<name>/**  deliberately wrong versions that
 *                                               the hidden tests must catch
 */

/** Reads every file under `dir` as path → content (forward slashes, sorted). */
export function readProject(dir: string): Record<string, string> {
  const files: Record<string, string> = {};
  const walk = (d: string): void => {
    for (const name of readdirSync(d).sort()) {
      const full = join(d, name);
      if (statSync(full).isDirectory()) walk(full);
      else files[relative(dir, full).replace(/\\/g, '/')] = readFileSync(full, 'utf8');
    }
  };
  walk(dir);
  return files;
}

/** Directory of a challenge module (pass `import.meta.url`). */
export const challengeDir = (moduleUrl: string): string => fileURLToPath(new URL('.', moduleUrl));

/** A deliberately wrong solution the hidden tests must reject (checked against the real runner). */
export interface Mutant {
  readonly framework: WebImplementationSource['framework'];
  readonly name: string;
  readonly files: Readonly<Record<string, string>>;
}

/** Reads `<framework>/mutants/<name>/` folders. */
export function readMutants(dir: string, framework: Mutant['framework']): Mutant[] {
  const root = join(dir, framework, 'mutants');
  let names: string[];
  try {
    names = readdirSync(root).sort();
  } catch {
    return [];
  }
  return names.map((name) => ({ framework, name, files: readProject(join(root, name)) }));
}

/** An implementation read from disk. */
export function implementation(
  dir: string,
  options: Omit<WebImplementationSource, 'starter' | 'reference'>,
): WebImplementationSource {
  const base = join(dir, options.framework);
  return {
    ...options,
    starter: readProject(join(base, 'starter')),
    reference: options.status === 'available' ? readProject(join(base, 'reference')) : {},
  };
}

type Expect = {
  readonly status: number | readonly number[];
  readonly json?: readonly JsonAssertion[];
  readonly headers?: readonly HeaderAssertion[];
  readonly capture?: Readonly<Record<string, string>>;
};

const step = (
  method: HttpTestStep['request']['method'],
  path: string,
  body: unknown,
  expect: Expect,
): HttpTestStep => ({
  request: {
    method,
    path,
    ...(body === undefined
      ? {}
      : {
          body: typeof body === 'string' ? body : JSON.stringify(body),
          headers: { 'Content-Type': 'application/json' },
        }),
  },
  expect: {
    status: expect.status,
    ...(expect.json ? { json: expect.json } : {}),
    ...(expect.headers ? { headers: expect.headers } : {}),
  },
  ...(expect.capture ? { capture: expect.capture } : {}),
});

/** Request builders: `http.post('/api/x', { name: 'A' }, { status: 201 })`. */
export const http = {
  get: (path: string, expect: Expect) => step('GET', path, undefined, expect),
  delete: (path: string, expect: Expect) => step('DELETE', path, undefined, expect),
  post: (path: string, body: unknown, expect: Expect) => step('POST', path, body, expect),
  put: (path: string, body: unknown, expect: Expect) => step('PUT', path, body, expect),
  patch: (path: string, body: unknown, expect: Expect) => step('PATCH', path, body, expect),
};

/** JSON assertion builders. */
export const json = {
  equals: (path: string, value: unknown): JsonAssertion => ({ path, equals: value }),
  exists: (path: string): JsonAssertion => ({ path, exists: true }),
  absent: (path: string): JsonAssertion => ({ path, exists: false }),
  type: (path: string, type: Extract<JsonAssertion, { type: string }>['type']): JsonAssertion => ({
    path,
    type,
  }),
  contains: (path: string, item: Readonly<Record<string, unknown>>): JsonAssertion => ({
    path,
    contains: item,
  }),
  notContains: (path: string, item: Readonly<Record<string, unknown>>): JsonAssertion => ({
    path,
    notContains: item,
  }),
};

export const test = (
  id: string,
  category: string,
  description: string,
  steps: readonly HttpTestStep[],
): WebTest => ({ id, category, description, steps });
