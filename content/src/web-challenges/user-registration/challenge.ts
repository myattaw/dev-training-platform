import type { WebChallengeSource } from '@pracstack/content-model';
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
 * Validate User Registration: one sign-up endpoint with real-world rules
 * (normalization, password policy, cross-field checks, unique emails), the
 * same HTTP contract in ASP.NET Core, Spring Boot and Django REST Framework.
 * All data is synthetic; there is no real authentication provider.
 */
const dir = challengeDir(import.meta.url);

const VALID_PASSWORD = 'Valid-Password-42';

/** A valid registration body for `email`, with optional overrides. */
const registration = (
  email: string,
  overrides: Readonly<Record<string, unknown>> = {},
): Record<string, unknown> => ({
  email,
  displayName: 'Test User',
  password: VALID_PASSWORD,
  confirmPassword: VALID_PASSWORD,
  acceptTerms: true,
  ...overrides,
});

const grace = {
  email: 'grace@example.com',
  displayName: 'Grace Hopper',
  password: 'Compiler-Pioneer-1952',
  confirmPassword: 'Compiler-Pioneer-1952',
  acceptTerms: true,
};

const ALL_FIELDS = ['email', 'displayName', 'password', 'confirmPassword', 'acceptTerms'];

export const source: WebChallengeSource = {
  challenge: {
    id: 'user-registration',
    version: 1,
    title: 'Validate User Registration',
    summary:
      'Finish a sign-up endpoint: normalize the input, enforce a password policy, report every invalid field, reject taken emails, and never store or return the password.',
    difficulty: 'easy',
    category: 'business-logic',
    estimatedMinutes: 30,
    access: 'free',
    competencies: ['input-validation', 'rest-apis', 'security'],
    prerequisiteSkills: [],
    objectives: [
      'Normalize input (trim, lower-case) before validating it and before checking for duplicates.',
      'Report every invalid field in one 400 response, including rules that compare two fields.',
      'Keep secrets out of storage and responses: store a password hash, return only public fields.',
      'Make a failed request leave no trace in the stored data.',
    ],
    instructions: [
      {
        kind: 'paragraph',
        text: 'A community learning site is opening sign-ups. A colleague created the project: accounts are kept in a store seeded with one account (`ada@example.com`), `GET /api/registrations/{id}` already works, and a password hasher is ready. Your job is to implement `POST /api/registrations`. All data in this challenge is synthetic.',
      },
      { kind: 'heading', text: 'Requirements' },
      {
        kind: 'list',
        items: [
          '`POST /api/registrations` takes a JSON body `{ "email", "displayName", "password", "confirmPassword", "acceptTerms" }`.',
          'Trim `email` and `displayName`, and lower-case `email`, before validating them and before checking for duplicates. Do not trim or change the password.',
          '`email` is required and must contain exactly one `@` with text before it, no spaces, and a domain (the part after `@`) that contains a `.` but does not start or end with one.',
          '`displayName` is required and must be 2 to 40 characters long after trimming.',
          '`password` is required, at least 12 characters long, and contains an upper-case letter (`A`-`Z`), a lower-case letter (`a`-`z`) and a digit (`0`-`9`). When the email is valid, the password must not contain the part of the email before the `@`, ignoring case.',
          '`confirmPassword` is required and must be exactly equal to `password`.',
          '`acceptTerms` must be `true`.',
          'Invalid input returns 400 with a JSON body `{ "errors": { "<field>": ["message", ...] } }` that lists every invalid field at once (`email`, `displayName`, `password`, `confirmPassword`, `acceptTerms`). A body that is not valid JSON also returns 400.',
          'Emails are unique, ignoring case: when the input is valid but the email is already registered, return 409 Conflict.',
          'On success return 201 Created, a `Location` header ending in `/api/registrations/{id}`, and the account as JSON with exactly `id`, `email` and `displayName`.',
          'Store only a hash of the password (use the provided hasher). Never return the password, the confirmation or the hash, and never store anything for a request that fails.',
        ],
      },
      { kind: 'heading', text: 'How your API is tested' },
      {
        kind: 'paragraph',
        text: 'Your project is built and started in an isolated sandbox, and tests send it real HTTP requests, in order, against one running instance. Visible tests show their requests and expectations; hidden tests check edge cases and report only their category. JSON is compared by value: property order does not matter.',
      },
    ],
    endpoints: [
      {
        method: 'POST',
        path: '/api/registrations',
        summary: 'Register an account.',
        exampleBody: JSON.stringify(grace, null, 2),
        responses: [
          '201 Created with Location and { id, email, displayName }',
          '400 Bad Request with { "errors": { ... } } listing every invalid field',
          '409 Conflict when the email is already registered',
        ],
      },
      {
        method: 'GET',
        path: '/api/registrations/1',
        summary: 'One account (already implemented).',
        responses: ['200 OK with { id, email, displayName }', '404 Not Found'],
      },
    ],
    hints: [
      'Normalize first, then validate, then check for duplicates, then store: in that order.',
      'Collect errors in a dictionary/map keyed by field name and return them all at once; do not stop at the first problem.',
      'Rules that compare fields (password vs. email, confirmation vs. password) must still run when another field is invalid.',
      'Return a response object with only the public fields, never the stored account itself.',
      'Django REST Framework skips `validate()` when a field fails its own validation: keep all checks in one place if you need every error at once.',
    ],
    visibleTests: [
      test('registers-user', 'registering', 'registers an account and reads it back', [
        http.post('/api/registrations', grace, {
          status: 201,
          json: [
            json.type('id', 'number'),
            json.equals('email', 'grace@example.com'),
            json.equals('displayName', 'Grace Hopper'),
            json.absent('password'),
          ],
          headers: [{ name: 'Location', matches: '/api/registrations/\\d+$' }],
          capture: { id: 'id' },
        }),
        http.get('/api/registrations/{{id}}', {
          status: 200,
          json: [
            json.equals('email', 'grace@example.com'),
            json.equals('displayName', 'Grace Hopper'),
          ],
        }),
      ]),
      test(
        'rejects-weak-password',
        'validation',
        'rejects a weak password and a confirmation that does not match',
        [
          http.post(
            '/api/registrations',
            {
              email: 'alan@example.com',
              displayName: 'Alan Turing',
              password: 'enigma',
              confirmPassword: 'enigma2',
              acceptTerms: true,
            },
            {
              status: 400,
              json: [
                json.exists('errors.password'),
                json.exists('errors.confirmPassword'),
                json.absent('errors.email'),
                json.absent('errors.displayName'),
                json.absent('errors.acceptTerms'),
              ],
            },
          ),
        ],
      ),
      test('rejects-taken-email', 'duplicates', 'rejects an email that is already registered', [
        http.post('/api/registrations', registration('ada@example.com'), { status: 409 }),
      ]),
      test('unknown-registration', 'not-found', 'returns 404 for an unknown account', [
        http.get('/api/registrations/999999', { status: 404 }),
      ]),
    ],
  },
  hiddenTests: [
    test('normalizes-input', 'normalization', 'trims the input and lower-cases the email', [
      http.post(
        '/api/registrations',
        registration('  Katherine.Johnson@Example.COM ', {
          displayName: '  Katherine Johnson  ',
          password: 'Orbital-Math-1962',
          confirmPassword: 'Orbital-Math-1962',
        }),
        {
          status: 201,
          json: [
            json.equals('email', 'katherine.johnson@example.com'),
            json.equals('displayName', 'Katherine Johnson'),
          ],
          capture: { id: 'id' },
        },
      ),
      http.get('/api/registrations/{{id}}', {
        status: 200,
        json: [
          json.equals('email', 'katherine.johnson@example.com'),
          json.equals('displayName', 'Katherine Johnson'),
        ],
      }),
    ]),
    test(
      'duplicate-ignoring-case',
      'duplicates',
      'treats emails that differ only in case as taken',
      [
        http.post('/api/registrations', registration('dorothy@example.com'), { status: 201 }),
        http.post('/api/registrations', registration(' DOROTHY@Example.com '), { status: 409 }),
        http.post('/api/registrations', registration('ADA@EXAMPLE.COM'), { status: 409 }),
      ],
    ),
    test('every-invalid-field', 'validation', 'lists every invalid field in one response', [
      http.post(
        '/api/registrations',
        {
          email: 'not-an-email',
          displayName: 'A',
          password: 'short',
          confirmPassword: 'different',
          acceptTerms: false,
        },
        { status: 400, json: ALL_FIELDS.map((f) => json.exists(`errors.${f}`)) },
      ),
    ]),
    test('required-fields', 'validation', 'reports every missing field', [
      http.post(
        '/api/registrations',
        {},
        {
          status: 400,
          json: ALL_FIELDS.map((f) => json.exists(`errors.${f}`)),
        },
      ),
      http.post(
        '/api/registrations',
        registration('blank.name@example.com', { displayName: '   ' }),
        {
          status: 400,
          json: [
            json.exists('errors.displayName'),
            json.absent('errors.email'),
            json.absent('errors.password'),
          ],
        },
      ),
    ]),
    test('email-format', 'validation', 'applies every email rule', [
      ...[
        'plainaddress',
        'two@@example.com',
        'a@b@example.com',
        'john doe@example.com',
        '@example.com',
        'john@',
        'john@localhost',
        'john@.example.com',
        'john@example.',
      ].map((email) =>
        http.post('/api/registrations', registration(email), {
          status: 400,
          json: [json.exists('errors.email'), json.absent('errors.password')],
        }),
      ),
    ]),
    test(
      'display-name-length',
      'validation',
      'allows display names of 2 to 40 characters after trimming',
      [
        http.post(
          '/api/registrations',
          registration('short.name@example.com', { displayName: ' J ' }),
          {
            status: 400,
            json: [json.exists('errors.displayName')],
          },
        ),
        http.post(
          '/api/registrations',
          registration('long.name@example.com', { displayName: 'x'.repeat(41) }),
          { status: 400, json: [json.exists('errors.displayName')] },
        ),
        http.post(
          '/api/registrations',
          registration('long.name@example.com', { displayName: `  ${'y'.repeat(40)} ` }),
          { status: 201, json: [json.equals('displayName', 'y'.repeat(40))] },
        ),
        http.post('/api/registrations', registration('bo@example.com', { displayName: ' Bo ' }), {
          status: 201,
          json: [json.equals('displayName', 'Bo')],
        }),
      ],
    ),
    test('password-rules', 'validation', 'applies every password rule', [
      ...['Abcdefghi12', 'alllowercase123', 'ALLUPPERCASE123', 'NoDigitsHereAtAll'].map(
        (password) =>
          http.post(
            '/api/registrations',
            registration('policy@example.com', { password, confirmPassword: password }),
            { status: 400, json: [json.exists('errors.password'), json.absent('errors.email')] },
          ),
      ),
      http.post(
        '/api/registrations',
        registration('policy@example.com', {
          password: 'Exactly12Chr',
          confirmPassword: 'Exactly12Chr',
        }),
        { status: 201 },
      ),
    ]),
    test(
      'password-contains-email',
      'validation',
      'rejects a password that contains the email name, ignoring case',
      [
        http.post(
          '/api/registrations',
          registration('grace.hopper@navy.example.com', {
            password: 'Grace.Hopper-1906',
            confirmPassword: 'Grace.Hopper-1906',
          }),
          { status: 400, json: [json.exists('errors.password'), json.absent('errors.email')] },
        ),
        http.post(
          '/api/registrations',
          registration('grace.hopper@navy.example.com', {
            password: 'Navy-Admiral-1906',
            confirmPassword: 'Navy-Admiral-1906',
          }),
          { status: 201 },
        ),
      ],
    ),
    test('terms-must-be-accepted', 'validation', 'requires acceptTerms to be true', [
      http.post('/api/registrations', registration('terms@example.com', { acceptTerms: false }), {
        status: 400,
        json: [json.exists('errors.acceptTerms'), json.absent('errors.email')],
      }),
      http.post(
        '/api/registrations',
        registration('terms@example.com', { acceptTerms: undefined }),
        {
          status: 400,
          json: [json.exists('errors.acceptTerms')],
        },
      ),
    ]),
    test('never-returns-password', 'security', 'never returns the password or its hash', [
      http.post(
        '/api/registrations',
        registration('private@example.com', { displayName: 'Private Person' }),
        {
          status: 201,
          json: [
            json.equals('displayName', 'Private Person'),
            json.absent('password'),
            json.absent('confirmPassword'),
            json.absent('passwordHash'),
            json.absent('password_hash'),
          ],
          capture: { id: 'id' },
        },
      ),
      http.get('/api/registrations/{{id}}', {
        status: 200,
        json: [
          json.equals('email', 'private@example.com'),
          json.absent('password'),
          json.absent('passwordHash'),
          json.absent('password_hash'),
        ],
      }),
    ]),
    test(
      'failed-registration-stores-nothing',
      'security',
      'stores nothing when a registration fails',
      [
        http.post('/api/registrations', registration('ghost@example.com', { acceptTerms: false }), {
          status: 400,
        }),
        http.post(
          '/api/registrations',
          registration('ghost@example.com', { confirmPassword: 'Something-Else-42' }),
          { status: 400 },
        ),
        http.post('/api/registrations', registration('ghost@example.com'), { status: 201 }),
      ],
    ),
    test('invalid-json', 'validation', 'rejects a body that is not JSON', [
      http.post('/api/registrations', '{"email": "broken@example.com"', { status: 400 }),
    ]),
  ],
  implementations: [
    implementation(dir, {
      framework: 'aspnetcore',
      status: 'available',
      runtime: '.NET 10 · ASP.NET Core 10 (controllers)',
      database: 'in-memory',
      editable: ['Controllers/RegistrationsController.cs', 'Services/RegistrationService.cs'],
      entryFile: 'Services/RegistrationService.cs',
    }),
    implementation(dir, {
      framework: 'spring-boot',
      status: 'available',
      runtime: 'Java 21 · Spring Boot 4.1 (Spring MVC)',
      database: 'in-memory',
      editable: [
        'src/main/java/com/pracstack/registration/web/RegistrationController.java',
        'src/main/java/com/pracstack/registration/service/RegistrationService.java',
      ],
      entryFile: 'src/main/java/com/pracstack/registration/service/RegistrationService.java',
      spring: {
        mainClass: 'com.pracstack.registration.RegistrationApplication',
        librarySet: 'core',
      },
    }),
    implementation(dir, {
      framework: 'django',
      status: 'available',
      runtime: 'Python 3.14 · Django 5.2 LTS · Django REST Framework 3.16',
      database: 'sqlite',
      editable: ['accounts/serializers.py', 'accounts/views.py'],
      entryFile: 'accounts/serializers.py',
    }),
  ],
};

export const mutants: readonly Mutant[] = [
  ...readMutants(dir, 'aspnetcore'),
  ...readMutants(dir, 'spring-boot'),
  ...readMutants(dir, 'django'),
];
