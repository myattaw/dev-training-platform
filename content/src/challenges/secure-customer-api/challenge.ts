import { readFileSync } from 'node:fs';
import type { ChallengeSource, ChallengeTest, OperationStep } from '@pracstack/content-model';

/**
 * Enterprise challenge: secure an insecure ASP.NET Core customer API (broken
 * object-level authorization, over-exposed entity, leaking error details).
 * TestDriver.cs (public, read-only) hosts the learner's endpoints on a loopback
 * port with a simulated authentication scheme (X-User-Id / X-Roles headers) and
 * sends real HTTP requests; every test is a fresh app instance.
 */

const driver = readFileSync(new URL('./TestDriver.cs', import.meta.url), 'utf8');
const starter = readFileSync(new URL('./Starter.cs', import.meta.url), 'utf8');

const ANON = '';
const SUPPORT = 'support:agent-7';

const json = (body: Readonly<Record<string, unknown>> | string | null): string | null =>
  body === null ? null : typeof body === 'string' ? body : JSON.stringify(body);

const status = (
  user: string,
  method: string,
  path: string,
  expected: number,
  body: Parameters<typeof json>[0] = null,
): OperationStep => ({
  call: 'status',
  args: [user, method, path, json(body)],
  expected,
});
const field = (
  user: string,
  path: string,
  name: string,
  expected: string | null,
  method = 'GET',
  body: Parameters<typeof json>[0] = null,
): OperationStep => ({ call: 'field', args: [user, method, path, json(body), name], expected });
const contains = (
  user: string,
  method: string,
  path: string,
  body: Parameters<typeof json>[0],
  text: string,
  expected: boolean,
): OperationStep => ({
  call: 'bodyContains',
  args: [user, method, path, json(body), text],
  expected,
});

const test = (description: string, steps: OperationStep[]): ChallengeTest => ({
  kind: 'operations',
  description,
  constructorArgs: [],
  steps,
});

const email = (value: string | null) => ({ email: value });

export const source: ChallengeSource = {
  challenge: {
    id: 'secure-customer-api',
    version: 1,
    title: 'Secure the Customer API',
    summary:
      'Fix an ASP.NET Core API that shows any customer to anyone, returns password hashes and leaks stack traces.',
    category: 'enterprise',
    difficulty: 'medium',
    tags: ['access-control', 'input-validation', 'rest-apis'],
    instructions: [
      {
        kind: 'paragraph',
        text: 'A penetration test of the customer portal’s API found three problems. The code works, which is exactly the problem: any caller can read any customer, the responses include the password hash and tax id, and a bad request returns the full exception with its stack trace. Fix the API.',
      },
      { kind: 'heading', text: 'Findings to fix' },
      {
        kind: 'list',
        items: [
          'Broken authentication: every `/customers` endpoint must require a signed-in user. Anonymous requests get 401.',
          'Broken object-level authorization (OWASP API1): a customer may only see and change the records they own (`OwnerUserId` equals the user id, the `ClaimTypes.NameIdentifier` claim). A user with the role `support` may read every record but change none.',
          'Excessive data exposure: responses contain only `id`, `name` and `email`, never `passwordHash`, `taxId` or `ownerUserId`.',
          'Information leakage: errors must never contain exception types, messages or stack traces.',
        ],
      },
      { kind: 'heading', text: 'Required behaviour' },
      {
        kind: 'list',
        items: [
          '`GET /customers` returns 200 with the records the caller may read, ordered by id (all of them for `support`).',
          '`GET /customers/{id}` returns 200 with the record, or 404 when it does not exist or the caller may not read it. Use 404 rather than 403 here so the API does not reveal that someone else’s record exists.',
          '`PUT /customers/{id}/email` with `{ "email": "..." }` returns 204 for the owner. For a record the caller cannot read, or one that does not exist: 404. For `support` (who can see the record but not change it): 403. Check access before validating the body, so a 400 never confirms that a record exists.',
          'An invalid email returns 400 with validation problem details (`Results.ValidationProblem`) whose `errors` has an `email` key. `CustomerStore.UpdateEmail` already validates and throws `ArgumentException`; translate that, without its message.',
        ],
      },
      { kind: 'heading', text: 'How your API is tested' },
      {
        kind: 'paragraph',
        text: 'A read-only test driver (below) starts a fresh copy of your API for each test, with a simulated authentication scheme: the header `X-User-Id` becomes the signed-in user and `X-Roles` their roles. `UseAuthentication` and `UseAuthorization` are already in the pipeline, so `RequireAuthorization()` and `ClaimsPrincipal` parameters work. Keep the seed data in `CustomerStore`.',
      },
      { kind: 'code', code: driver.trim() },
    ],
    languages: {
      csharp: { entryPoint: 'CustomerApiClient', supportCode: driver, starterCode: starter },
    },
    visibleTests: [
      test('the owner reads their own record', [
        status('alice', 'GET', '/customers/1', 200),
        field('alice', '/customers/1', 'name', 'Alice Martin'),
      ]),
      test('anonymous requests get 401', [
        status(ANON, 'GET', '/customers/1', 401),
        status(ANON, 'GET', '/customers', 401),
      ]),
      test('another user’s record looks like it does not exist', [
        status('bob', 'GET', '/customers/1', 404),
        status('bob', 'GET', '/customers/99', 404),
      ]),
      test('never returns the password hash or tax id', [
        field('alice', '/customers/1', 'email', 'alice@example.com'),
        field('alice', '/customers/1', 'passwordHash', null),
        field('alice', '/customers/1', 'taxId', null),
      ]),
    ],
  },
  hiddenTests: [
    test('lists only the caller’s own records, without sensitive fields', [
      field('alice', '/customers', 'length', '2'),
      field('alice', '/customers', '0.id', '1'),
      field('alice', '/customers', '1.id', '3'),
      field('alice', '/customers', '1.taxId', null),
      field('alice', '/customers', '0.ownerUserId', null),
      field('bob', '/customers', 'length', '1'),
      field('bob', '/customers', '0.passwordHash', null),
      field('carol', '/customers', 'length', '0'),
    ]),
    test('support can read every record, still without sensitive fields', [
      field(SUPPORT, '/customers/2', 'name', 'Bob Okafor'),
      field(SUPPORT, '/customers/2', 'taxId', null),
      field(SUPPORT, '/customers', 'length', '3'),
      status(SUPPORT, 'GET', '/customers/99', 404),
      status('customer:bob', 'GET', '/customers/1', 404),
    ]),
    test('the owner updates their email', [
      status('alice', 'PUT', '/customers/3/email', 204, email(' invoices@martin.example ')),
      field('alice', '/customers/3', 'email', 'invoices@martin.example'),
    ]),
    test('nobody else can change the email', [
      status(ANON, 'PUT', '/customers/1/email', 401, email('x@evil.example')),
      status('bob', 'PUT', '/customers/1/email', 404, email('x@evil.example')),
      status(SUPPORT, 'PUT', '/customers/1/email', 403, email('x@evil.example')),
      status('alice', 'PUT', '/customers/99/email', 404, email('x@example.com')),
      field('alice', '/customers/1', 'email', 'alice@example.com'),
    ]),
    test('checks access before validating, so a 400 never reveals a record', [
      status('bob', 'PUT', '/customers/1/email', 404, email('not-an-email')),
      status('bob', 'PUT', '/customers/99/email', 404, email('not-an-email')),
    ]),
    test('an invalid email is a safe 400 with validation problem details', [
      status('alice', 'PUT', '/customers/1/email', 400, email('not-an-email')),
      field('alice', '/customers/1/email', 'errors.email.length', '1', 'PUT', email('a@b@c')),
      field('alice', '/customers/1/email', 'errors.email.length', '1', 'PUT', {}),
      contains('alice', 'PUT', '/customers/1/email', email('not-an-email'), 'Exception', false),
      contains('alice', 'PUT', '/customers/1/email', email('not-an-email'), 'CustomerStore', false),
      contains('alice', 'PUT', '/customers/1/email', email('not-an-email'), 'not-an-email', false),
      field('alice', '/customers/1', 'email', 'alice@example.com'),
    ]),
    test('a body that is not JSON is a 400', [
      status('alice', 'PUT', '/customers/1/email', 400, '{"email": '),
    ]),
  ],
};
