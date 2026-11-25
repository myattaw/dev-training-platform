import type { HttpTestStep, WebChallengeSource } from '@pracstack/content-model';
import {
  challengeDir,
  http,
  implementation,
  json,
  readMutants,
  test,
  type Mutant,
} from '../helpers';

/**
 * Role-Based Access Control: secure an expense-report API with bearer tokens,
 * roles and object ownership. Identities are synthetic: fixed test tokens in a
 * read-only identity store, no identity provider and no real credentials.
 */
const dir = challengeDir(import.meta.url);

const ALICE = 'Bearer test-token-alice';
const BOB = 'Bearer test-token-bob';
const ADMIN = 'Bearer test-token-admin';

/** Sends a step with an Authorization header (the value exactly as given). */
const withAuth = (authorization: string, step: HttpTestStep): HttpTestStep => ({
  ...step,
  request: {
    ...step.request,
    headers: { ...step.request.headers, Authorization: authorization },
  },
});
const user = {
  alice: (step: HttpTestStep) => withAuth(ALICE, step),
  bob: (step: HttpTestStep) => withAuth(BOB, step),
  admin: (step: HttpTestStep) => withAuth(ADMIN, step),
};

const bearerChallenge = [{ name: 'WWW-Authenticate', matches: '^Bearer' }];

export const source: WebChallengeSource = {
  challenge: {
    id: 'role-based-access-control',
    version: 1,
    title: 'Role-Based Access Control',
    summary:
      'Secure an expense-report API: authenticate bearer tokens, enforce roles and ownership, and answer 401, 403 and 404 where each is correct.',
    difficulty: 'hard',
    category: 'auth',
    estimatedMinutes: 60,
    access: 'free',
    competencies: ['authorization', 'authentication', 'security', 'rest-apis'],
    prerequisiteSkills: [],
    objectives: [
      'Authenticate requests from a bearer token in one place (middleware, interceptor or authentication class).',
      'Tell 401 Unauthorized (who are you?) from 403 Forbidden (you may not do this).',
      'Enforce object ownership so users cannot read other people\'s data, and hide what they may not see.',
      'Take the owner of new data from the authenticated identity, never from the request body.',
    ],
    instructions: [
      {
        kind: 'paragraph',
        text: 'Finance is moving expense reports into an internal API. A colleague wrote the endpoints, but nothing is secured yet: anyone can read every report, create reports in someone else\'s name and approve them. Secure the API before it goes live. Identities come from a read-only identity store; in this sandbox they are fixed test tokens (no real identity provider and no real credentials).',
      },
      { kind: 'heading', text: 'Test identities' },
      {
        kind: 'list',
        items: [
          '`test-token-alice`: user `alice`, role `employee`.',
          '`test-token-bob`: user `bob`, role `employee`.',
          '`test-token-admin`: user `admin`, role `admin`.',
          'Seeded reports: 1 (`alice`, submitted), 2 (`bob`, submitted), 3 (`alice`, approved by `admin`).',
        ],
      },
      { kind: 'heading', text: 'Authentication' },
      {
        kind: 'list',
        items: [
          '`GET /api/health` is public. Every other endpoint requires the header `Authorization: Bearer <token>`.',
          'The scheme `Bearer` is case-insensitive (`bearer` works too); the token after one space is case-sensitive.',
          'A missing header, another scheme (for example `Basic`), a header without a scheme, a missing token or an unknown token returns 401 Unauthorized with the header `WWW-Authenticate: Bearer`.',
          'Authentication comes first: an unauthenticated request gets 401 even when the report does not exist or the body is invalid.',
        ],
      },
      { kind: 'heading', text: 'Authorization' },
      {
        kind: 'list',
        items: [
          '`GET /api/reports`: employees get only their own reports; admins get every report. Ordered by id.',
          '`GET /api/reports/{id}`: the owner and admins get 200. Anyone else gets 404 Not Found, exactly as for a report that does not exist, so ids of other people\'s reports are not revealed.',
          '`POST /api/reports` with `{ "title", "amountCents" }`: any authenticated user. The owner is always the caller: `owner`, `status`, `approvedBy` or `id` in the body are ignored. New reports are `submitted`. Returns 201 with a `Location` header ending in `/api/reports/{id}` and the report.',
          '`POST /api/reports/{id}/approve`: admins only. Employees get 403 Forbidden, also for their own reports and for ids that do not exist. For an admin: 404 for an unknown report, 409 Conflict if it is already approved, otherwise 200 with the report, now `approved` with `approvedBy` set to the admin\'s username.',
          'Validation (already implemented): `title` is required, trimmed, at most 100 characters; `amountCents` is an integer from 1 to 1000000. Invalid input returns 400 with `{ "errors": { "<field>": [...] } }`.',
          'A report is `{ "id", "owner", "title", "amountCents", "status", "approvedBy" }`.',
        ],
      },
      { kind: 'heading', text: 'How your API is tested' },
      {
        kind: 'paragraph',
        text: 'Your project is built and started in an isolated sandbox, and tests send it real HTTP requests, in order, against one running instance. Visible tests show their requests, headers and expectations; hidden tests report only their category. JSON is compared by value: property order does not matter.',
      },
    ],
    endpoints: [
      {
        method: 'GET',
        path: '/api/health',
        summary: 'Health check (public).',
        responses: ['200 OK with { "status": "ok" }'],
      },
      {
        method: 'GET',
        path: '/api/reports',
        summary: 'Reports the caller may see. Header: Authorization: Bearer test-token-alice',
        responses: ['200 OK with an array of reports', '401 Unauthorized'],
      },
      {
        method: 'GET',
        path: '/api/reports/1',
        summary: 'One report (owner or admin).',
        responses: ['200 OK with the report', '401 Unauthorized', '404 Not Found (also for someone else\'s report)'],
      },
      {
        method: 'POST',
        path: '/api/reports',
        summary: 'Create a report owned by the caller.',
        exampleBody: JSON.stringify({ title: 'Taxi to the airport', amountCents: 4200 }, null, 2),
        responses: [
          '201 Created with Location and the report',
          '400 Bad Request with { "errors": { ... } }',
          '401 Unauthorized',
        ],
      },
      {
        method: 'POST',
        path: '/api/reports/2/approve',
        summary: 'Approve a report (admins only). Header: Authorization: Bearer test-token-admin',
        responses: [
          '200 OK with the approved report',
          '401 Unauthorized',
          '403 Forbidden for employees',
          '404 Not Found',
          '409 Conflict when already approved',
        ],
      },
    ],
    hints: [
      'Authenticate in one place that runs before every report endpoint, and keep the controllers or views for authorization decisions.',
      '401 means the server does not know who you are; 403 means it knows and the answer is no. An unknown token is the first case.',
      'Split the header at the first space, compare the scheme ignoring case, and look the token up exactly as sent.',
      'Django REST Framework answers 403 instead of 401 for unauthenticated requests unless the first authentication class returns a value from `authenticate_header`.',
      'For reads, filter by owner in the query or check the owner before answering; for creates, set the owner from the authenticated user, not from the body.',
    ],
    visibleTests: [
      test('health-is-public', 'authentication', 'answers the health check without a token', [
        http.get('/api/health', { status: 200, json: [json.equals('status', 'ok')] }),
      ]),
      test('requires-a-token', 'authentication', 'answers 401 with a Bearer challenge without a token', [
        http.get('/api/reports', { status: 401, headers: bearerChallenge }),
      ]),
      test('employee-sees-own-reports', 'authorization', 'shows an employee only their own reports', [
        user.alice(
          http.get('/api/reports', {
            status: 200,
            json: [
              json.contains('', { id: 1, owner: 'alice', title: 'Client dinner' }),
              json.contains('', { id: 3, owner: 'alice', status: 'approved' }),
              json.notContains('', { owner: 'bob' }),
            ],
          }),
        ),
        user.alice(
          http.get('/api/reports/1', {
            status: 200,
            json: [json.equals('owner', 'alice'), json.equals('amountCents', 8450)],
          }),
        ),
      ]),
      test('admin-sees-all-reports', 'authorization', 'shows an admin every report', [
        user.admin(
          http.get('/api/reports', {
            status: 200,
            json: [
              json.contains('', { id: 1, owner: 'alice' }),
              json.contains('', { id: 2, owner: 'bob' }),
            ],
          }),
        ),
      ]),
      test('creates-report', 'reports', 'creates a report owned by the caller', [
        user.alice(
          http.post(
            '/api/reports',
            { title: 'Taxi to the airport', amountCents: 4200 },
            {
              status: 201,
              json: [
                json.type('id', 'number'),
                json.equals('owner', 'alice'),
                json.equals('title', 'Taxi to the airport'),
                json.equals('amountCents', 4200),
                json.equals('status', 'submitted'),
              ],
              headers: [{ name: 'Location', matches: '/api/reports/\\d+$' }],
              capture: { id: 'id' },
            },
          ),
        ),
        user.alice(
          http.get('/api/reports/{{id}}', {
            status: 200,
            json: [json.equals('title', 'Taxi to the airport')],
          }),
        ),
      ]),
      test('employee-cannot-approve', 'authorization', 'forbids employees to approve reports', [
        user.bob(http.post('/api/reports/2/approve', undefined, { status: 403 })),
        user.admin(
          http.get('/api/reports/2', { status: 200, json: [json.equals('status', 'submitted')] }),
        ),
      ]),
      test('admin-approves', 'reports', 'lets an admin approve a submitted report', [
        user.bob(
          http.post(
            '/api/reports',
            { title: 'Parking at client site', amountCents: 1800 },
            { status: 201, capture: { id: 'id' } },
          ),
        ),
        user.admin(
          http.post('/api/reports/{{id}}/approve', undefined, {
            status: 200,
            json: [
              json.equals('status', 'approved'),
              json.equals('approvedBy', 'admin'),
              json.equals('owner', 'bob'),
            ],
          }),
        ),
        user.bob(
          http.get('/api/reports/{{id}}', {
            status: 200,
            json: [json.equals('status', 'approved'), json.equals('approvedBy', 'admin')],
          }),
        ),
      ]),
    ],
  },
  hiddenTests: [
    test(
      'cannot-read-others-reports',
      'object-ownership',
      'hides other people\'s reports from employees',
      [
        user.alice(
          http.post(
            '/api/reports',
            { title: 'Hotel in Lisbon', amountCents: 31250 },
            { status: 201, capture: { id: 'id' } },
          ),
        ),
        user.bob(http.get('/api/reports/{{id}}', { status: 404 })),
        user.bob(http.get('/api/reports/1', { status: 404 })),
        user.bob(
          http.get('/api/reports', {
            status: 200,
            json: [
              json.contains('', { id: 2, owner: 'bob' }),
              json.notContains('', { title: 'Hotel in Lisbon' }),
              json.notContains('', { owner: 'alice' }),
            ],
          }),
        ),
        user.admin(
          http.get('/api/reports/{{id}}', { status: 200, json: [json.equals('owner', 'alice')] }),
        ),
      ],
    ),
    test(
      'cannot-approve-others-reports',
      'authorization',
      'forbids employees to approve any report, including their own',
      [
        user.alice(
          http.post(
            '/api/reports',
            { title: 'Team lunch', amountCents: 9600 },
            { status: 201, capture: { id: 'id' } },
          ),
        ),
        user.bob(http.post('/api/reports/{{id}}/approve', undefined, { status: 403 })),
        user.alice(http.post('/api/reports/{{id}}/approve', undefined, { status: 403 })),
        user.bob(http.post('/api/reports/999999/approve', undefined, { status: 403 })),
        user.alice(
          http.get('/api/reports/{{id}}', {
            status: 200,
            json: [json.equals('status', 'submitted')],
          }),
        ),
      ],
    ),
    test('body-cannot-forge-owner', 'object-ownership', 'ignores ownership fields in the body', [
      user.bob(
        http.post(
          '/api/reports',
          {
            title: 'Forged lunch',
            amountCents: 1500,
            owner: 'alice',
            status: 'approved',
            approvedBy: 'admin',
            id: 1,
          },
          {
            status: 201,
            json: [json.equals('owner', 'bob'), json.equals('status', 'submitted')],
            capture: { id: 'id' },
          },
        ),
      ),
      user.alice(http.get('/api/reports/{{id}}', { status: 404 })),
      user.bob(
        http.get('/api/reports/{{id}}', {
          status: 200,
          json: [json.equals('owner', 'bob'), json.equals('title', 'Forged lunch')],
        }),
      ),
      user.alice(
        http.get('/api/reports', {
          status: 200,
          json: [json.notContains('', { title: 'Forged lunch' })],
        }),
      ),
      user.alice(
        http.get('/api/reports/1', { status: 200, json: [json.equals('title', 'Client dinner')] }),
      ),
    ]),
    test('authorization-header-variants', 'authentication', 'accepts only a well-formed bearer token', [
      withAuth('test-token-alice', http.get('/api/reports', { status: 401, headers: bearerChallenge })),
      withAuth('Bearer', http.get('/api/reports', { status: 401 })),
      withAuth('Bearer test-token-mallory', http.get('/api/reports', { status: 401, headers: bearerChallenge })),
      withAuth('Basic dGVzdDp0ZXN0', http.get('/api/reports', { status: 401 })),
      withAuth('Bearer TEST-TOKEN-ALICE', http.get('/api/reports', { status: 401 })),
      withAuth(
        'bearer test-token-alice',
        http.get('/api/reports', {
          status: 200,
          json: [json.contains('', { id: 1, owner: 'alice' })],
        }),
      ),
    ]),
    test(
      'authentication-comes-first',
      'authentication',
      'answers 401 before looking at ids, roles or bodies',
      [
        http.get('/api/reports/1', { status: 401 }),
        http.get('/api/reports/999999', { status: 401 }),
        http.post('/api/reports', { title: 'No token', amountCents: 100 }, { status: 401 }),
        http.post('/api/reports', { title: '' }, { status: 401 }),
        http.post('/api/reports/2/approve', undefined, { status: 401, headers: bearerChallenge }),
        withAuth('Bearer test-token-mallory', http.post('/api/reports/2/approve', undefined, { status: 401 })),
        user.admin(
          http.get('/api/reports', {
            status: 200,
            json: [
              json.notContains('', { title: 'No token' }),
              json.contains('', { id: 2, status: 'submitted' }),
            ],
          }),
        ),
      ],
    ),
    test('approval-rules', 'business-rules', 'handles unknown and already approved reports', [
      user.admin(http.post('/api/reports/3/approve', undefined, { status: 409 })),
      user.admin(http.post('/api/reports/999999/approve', undefined, { status: 404 })),
      user.admin(http.get('/api/reports/999999', { status: 404 })),
      user.admin(
        http.get('/api/reports/3', {
          status: 200,
          json: [json.equals('status', 'approved'), json.equals('approvedBy', 'admin')],
        }),
      ),
    ]),
    test('create-validation', 'validation', 'validates new reports', [
      user.alice(
        http.post(
          '/api/reports',
          { title: '   ', amountCents: 100 },
          { status: 400, json: [json.exists('errors.title')] },
        ),
      ),
      user.alice(
        http.post(
          '/api/reports',
          { title: 'Snacks', amountCents: 0 },
          { status: 400, json: [json.exists('errors.amountCents')] },
        ),
      ),
      user.alice(
        http.post(
          '/api/reports',
          { title: 'x'.repeat(101), amountCents: 100 },
          { status: 400, json: [json.exists('errors.title')] },
        ),
      ),
      user.alice(
        http.post(
          '/api/reports',
          { title: '  Printer paper  ', amountCents: 1_000_000 },
          { status: 201, json: [json.equals('title', 'Printer paper'), json.equals('owner', 'alice')] },
        ),
      ),
    ]),
  ],
  implementations: [
    implementation(dir, {
      framework: 'aspnetcore',
      status: 'available',
      runtime: '.NET 10 · ASP.NET Core 10 (controllers)',
      database: 'in-memory',
      editable: ['Security/BearerTokenMiddleware.cs', 'Controllers/ReportsController.cs'],
      entryFile: 'Security/BearerTokenMiddleware.cs',
    }),
    implementation(dir, {
      framework: 'spring-boot',
      status: 'available',
      runtime: 'Java 21 · Spring Boot 4.1 (Spring MVC)',
      database: 'in-memory',
      editable: [
        'src/main/java/com/pracstack/expenses/security/BearerTokenInterceptor.java',
        'src/main/java/com/pracstack/expenses/web/ReportController.java',
      ],
      entryFile: 'src/main/java/com/pracstack/expenses/security/BearerTokenInterceptor.java',
      spring: { mainClass: 'com.pracstack.expenses.ExpenseApplication', librarySet: 'core' },
    }),
    implementation(dir, {
      framework: 'django',
      status: 'available',
      runtime: 'Python 3.14 · Django 5.2 LTS · Django REST Framework 3.16',
      database: 'sqlite',
      editable: ['reports/authentication.py', 'reports/permissions.py', 'reports/views.py'],
      entryFile: 'reports/authentication.py',
    }),
  ],
};

export const mutants: readonly Mutant[] = [
  ...readMutants(dir, 'aspnetcore'),
  ...readMutants(dir, 'spring-boot'),
  ...readMutants(dir, 'django'),
];
