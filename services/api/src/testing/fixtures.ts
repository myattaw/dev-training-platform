import { randomUUID } from 'node:crypto';
import type { UserInfo } from '@pracstack/api-contracts';
import { splitTrack, type TrackSource } from '@pracstack/content-model';
import { type ApiDeps, createApi } from '../app';
import type { Authenticator } from '../auth';
import { type ContentSource, createContentSource } from '../content/content-source';
import type { ApiRequest, ApiResponse } from '../http';
import { SlidingWindowRateLimiter } from '../rate-limit';
import { InMemoryProgressStore } from '../store/memory-store';

const p = (text: string) => [{ kind: 'paragraph' as const, text }];

/** A small track with one question per format, at difficulties 1–5. */
export const FIXTURE_TRACK: TrackSource = {
  id: 'demo',
  name: 'Demo',
  description: 'Demo track.',
  topics: [
    {
      id: 'demo-topic',
      name: 'Topic',
      description: 'Topic.',
      skills: [
        {
          id: 'demo-skill',
          name: 'Skill',
          description: 'Skill.',
          questions: [
            {
              id: 'q-mcq',
              version: 1,
              difficulty: 1,
              format: 'multiple-choice',
              prompt: p('Pick A.'),
              options: [
                { id: 'a', text: 'A' },
                { id: 'b', text: 'B' },
              ],
              selection: 'single',
              answer: { correct: ['a'] },
              hints: ['It is the first one.', 'It is A.'],
              explanation: p('A is right.'),
            },
            {
              id: 'q-multi',
              version: 1,
              difficulty: 2,
              format: 'multiple-choice',
              prompt: p('Pick the vowels.'),
              options: [
                { id: 'a', text: 'A' },
                { id: 'b', text: 'B' },
                { id: 'e', text: 'E' },
              ],
              selection: 'multiple',
              answer: { correct: ['a', 'e'] },
              hints: [],
              explanation: p('A and E are vowels.'),
            },
            {
              id: 'q-output',
              version: 1,
              difficulty: 3,
              format: 'predict-output',
              prompt: p('What is printed?'),
              code: { language: 'typescript', source: "console.log('a', 'b');" },
              answer: { output: 'a b' },
              hints: ['Two values.'],
              explanation: p('console.log joins with a space.'),
            },
            {
              id: 'q-blank',
              version: 1,
              difficulty: 4,
              format: 'fill-in-blank',
              prompt: p('Fill in the types.'),
              template: {
                language: 'typescript',
                source: 'let a: {{blank:first}} = 1; let b: {{blank:second}} = "x";',
              },
              answer: {
                blanks: { first: { accepted: ['number'] }, second: { accepted: ['string'] } },
              },
              hints: [],
              explanation: p('1 is a number, "x" is a string.'),
            },
            {
              id: 'q-hard',
              version: 1,
              difficulty: 5,
              format: 'multiple-choice',
              prompt: p('Pick B.'),
              options: [
                { id: 'a', text: 'A' },
                { id: 'b', text: 'B' },
              ],
              selection: 'single',
              answer: { correct: ['b'] },
              hints: [],
              explanation: p('B is right.'),
            },
          ],
        },
        {
          id: 'demo-sql',
          name: 'SQL skill',
          description: 'SQL.',
          questions: [
            {
              id: 'q-sql',
              version: 1,
              difficulty: 1,
              format: 'sql-query',
              dialect: 'postgresql',
              prompt: p('List all item names.'),
              ordered: false,
              database: {
                id: 'items',
                schema: 'CREATE TABLE items (name text);',
                sample: [{ table: 'items', columns: ['name'], rows: [['Tea']] }],
                hidden: [[{ table: 'items', columns: ['name'], rows: [['Juice']] }]],
              },
              answer: { referenceQuery: 'SELECT name FROM items' },
              hints: [],
              explanation: p('Select the names.'),
            },
          ],
        },
      ],
    },
  ],
};

export function fixtureContent() {
  const { catalog, questionsBySkill } = splitTrack(FIXTURE_TRACK);
  return createContentSource('test-content', [catalog], questionsBySkill);
}

export const ALICE: UserInfo = { id: 'alice', displayName: 'Alice', mode: 'authenticated' };
export const BOB: UserInfo = { id: 'bob', displayName: 'Bob', mode: 'authenticated' };

/** Authenticates from an `x-test-user` header (alice by default). Test-only. */
export const testAuth: Authenticator = {
  kind: 'jwt',
  authenticate: (req) => Promise.resolve(req.headers['x-test-user'] === 'bob' ? BOB : ALICE),
};

export interface TestApi {
  readonly call: (
    method: string,
    path: string,
    body?: unknown,
    user?: 'alice' | 'bob',
  ) => Promise<ApiResponse>;
  readonly store: InMemoryProgressStore;
  /** The content the API serves (to answer questions with their keys in tests). */
  readonly content: ContentSource;
  /** Moves the fake clock forward. */
  readonly advance: (ms: number) => void;
  readonly errors: unknown[];
}

export function testApi(overrides: Partial<ApiDeps> = {}): TestApi {
  let now = new Date('2026-11-21T12:00:00Z').getTime();
  const store = new InMemoryProgressStore();
  const errors: unknown[] = [];
  const content = overrides.content ?? fixtureContent();
  const api = createApi({
    auth: testAuth,
    content,
    store,
    rateLimiter: new SlidingWindowRateLimiter(1000, 60_000),
    now: () => new Date(now),
    random: () => 0,
    newId: randomUUID,
    logError: (err) => errors.push(err),
    ...overrides,
  });
  return {
    store,
    content,
    errors,
    advance: (ms) => {
      now += ms;
    },
    call: (method, path, body, user = 'alice') => {
      const [pathname, search = ''] = path.split('?');
      const request: ApiRequest = {
        method,
        path: pathname ?? path,
        query: Object.fromEntries(new URLSearchParams(search)),
        headers: { 'x-test-user': user },
        body,
      };
      return api(request);
    },
  };
}
