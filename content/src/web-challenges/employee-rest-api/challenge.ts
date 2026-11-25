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
 * Employee REST API: one business problem, one HTTP contract, three framework
 * implementations (ASP.NET Core, Spring Boot, Django REST Framework). The tests
 * are framework-neutral: they check behavior over HTTP, never implementation
 * details.
 */
const dir = challengeDir(import.meta.url);

const margaret = {
  name: 'Margaret Hamilton',
  email: 'margaret@example.com',
  department: 'Engineering',
};

export const source: WebChallengeSource = {
  challenge: {
    id: 'employee-rest-api',
    version: 1,
    title: 'Build an Employee REST API',
    summary:
      'Finish an HR service: read employees, create them with validation, reject duplicates and answer with the right status codes.',
    difficulty: 'easy',
    category: 'rest-apis',
    estimatedMinutes: 30,
    access: 'free',
    competencies: ['rest-apis', 'input-validation', 'http-status-codes', 'backend-development'],
    prerequisiteSkills: [],
    objectives: [
      'Map HTTP routes to controller or view code in a real project.',
      'Return 200, 201, 400, 404 and 409 where each is correct.',
      'Validate and normalize input in one place, and report every invalid field.',
      'Keep business rules (duplicates) in the service layer, not in the HTTP layer.',
    ],
    instructions: [
      {
        kind: 'paragraph',
        text: 'The HR team is replacing a spreadsheet with an internal service. A colleague started the project: listing employees works, and an in-memory store with three employees is ready. Your job is to finish the API so the HR front end can show one employee and create new ones.',
      },
      { kind: 'heading', text: 'Requirements' },
      {
        kind: 'list',
        items: [
          '`GET /api/employees/{id}` returns 200 with the employee, or 404 when there is none.',
          '`POST /api/employees` with a JSON body `{ "name", "email", "department" }` creates an employee and returns 201 Created, a `Location` header ending in `/api/employees/{id}`, and the new employee as JSON (`id`, `name`, `email`, `department`).',
          'Trim all three fields. Store the email in lower case.',
          '`name` is required, at most 100 characters. `email` must contain exactly one `@`, with text on both sides and no spaces. `department` must be exactly one of `Engineering`, `Finance`, `Sales`, `Support`.',
          'Invalid input returns 400 with a JSON body `{ "errors": { "<field>": ["message", ...] } }` listing every invalid field (`name`, `email`, `department`). A body that is not valid JSON also returns 400.',
          'Emails are unique, ignoring case: creating an employee whose email is already used returns 409 Conflict and stores nothing.',
          'Invalid or duplicate requests must not change the stored data.',
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
        method: 'GET',
        path: '/api/employees',
        summary: 'All employees, ordered by id (already implemented).',
        responses: ['200 OK with an array of employees'],
      },
      {
        method: 'GET',
        path: '/api/employees/2',
        summary: 'One employee.',
        responses: ['200 OK with the employee', '404 Not Found'],
      },
      {
        method: 'POST',
        path: '/api/employees',
        summary: 'Create an employee.',
        exampleBody: JSON.stringify(margaret, null, 2),
        responses: [
          '201 Created with Location and the employee',
          '400 Bad Request with { "errors": { ... } }',
          '409 Conflict for a duplicate email',
        ],
      },
    ],
    hints: [
      'Start with `GET /api/employees/{id}`: the store already has a find-by-id method.',
      'Collect validation errors in a dictionary/map keyed by field name, then return them all at once.',
      'Normalize (trim, lower-case the email) before you validate and before you check for duplicates.',
      'A duplicate is a business rule, not a validation error: it is 409, not 400.',
    ],
    visibleTests: [
      test('lists-employees', 'reading', 'lists the stored employees', [
        http.get('/api/employees', {
          status: 200,
          json: [
            json.type('', 'array'),
            json.contains('', {
              id: 1,
              name: 'Ada Lovelace',
              email: 'ada@example.com',
              department: 'Engineering',
            }),
            json.contains('', { id: 3, name: 'Linus Torvalds' }),
          ],
        }),
      ]),
      test('gets-one-employee', 'reading', 'returns one employee by id', [
        http.get('/api/employees/2', {
          status: 200,
          json: [
            json.equals('id', 2),
            json.equals('name', 'Grace Hopper'),
            json.equals('department', 'Engineering'),
          ],
        }),
      ]),
      test('unknown-employee', 'not-found', 'returns 404 for an unknown employee', [
        http.get('/api/employees/999999', { status: 404 }),
      ]),
      test('creates-employee', 'creating', 'creates an employee and reads it back', [
        http.post('/api/employees', margaret, {
          status: 201,
          json: [
            json.type('id', 'number'),
            json.equals('name', 'Margaret Hamilton'),
            json.equals('email', 'margaret@example.com'),
          ],
          headers: [{ name: 'Location', matches: '/api/employees/\\d+$' }],
          capture: { id: 'id' },
        }),
        http.get('/api/employees/{{id}}', {
          status: 200,
          json: [json.equals('email', 'margaret@example.com')],
        }),
        http.get('/api/employees', {
          status: 200,
          json: [json.contains('', { email: 'margaret@example.com' })],
        }),
      ]),
      test(
        'rejects-invalid-input',
        'validation',
        'rejects invalid input and lists the invalid fields',
        [
          http.post(
            '/api/employees',
            { name: '', email: 'not-an-email', department: 'Engineering' },
            {
              status: 400,
              json: [
                json.exists('errors.name'),
                json.exists('errors.email'),
                json.absent('errors.department'),
              ],
            },
          ),
        ],
      ),
    ],
  },
  hiddenTests: [
    test('normalizes-input', 'normalization', 'trims fields and lower-cases the email', [
      http.post(
        '/api/employees',
        {
          name: '  Katherine Johnson ',
          email: ' Katherine.Johnson@Example.COM ',
          department: ' Finance ',
        },
        {
          status: 201,
          json: [
            json.equals('name', 'Katherine Johnson'),
            json.equals('email', 'katherine.johnson@example.com'),
            json.equals('department', 'Finance'),
          ],
          capture: { id: 'id' },
        },
      ),
      http.get('/api/employees/{{id}}', {
        status: 200,
        json: [json.equals('email', 'katherine.johnson@example.com')],
      }),
    ]),
    test('duplicate-of-seeded', 'duplicates', 'rejects an email that differs only in case', [
      http.post(
        '/api/employees',
        { name: 'Ada Clone', email: ' ADA@example.com', department: 'Sales' },
        { status: 409 },
      ),
      http.get('/api/employees', {
        status: 200,
        json: [json.notContains('', { name: 'Ada Clone' })],
      }),
    ]),
    test(
      'duplicate-of-created',
      'duplicates',
      'rejects a second employee with a new but repeated email',
      [
        http.post(
          '/api/employees',
          { name: 'Dorothy Vaughan', email: 'dorothy@example.com', department: 'Support' },
          { status: 201 },
        ),
        http.post(
          '/api/employees',
          { name: 'D. Vaughan', email: ' Dorothy@EXAMPLE.com ', department: 'Support' },
          { status: 409 },
        ),
      ],
    ),
    test('email-rules', 'validation', 'applies every email rule', [
      http.post(
        '/api/employees',
        { name: 'A', email: 'a@@b.com', department: 'Sales' },
        { status: 400, json: [json.exists('errors.email')] },
      ),
      http.post(
        '/api/employees',
        { name: 'A', email: 'a b@c.io', department: 'Sales' },
        { status: 400, json: [json.exists('errors.email')] },
      ),
      http.post(
        '/api/employees',
        { name: 'A', email: '@c.io', department: 'Sales' },
        { status: 400, json: [json.exists('errors.email')] },
      ),
      http.post(
        '/api/employees',
        { name: 'A', email: 'a@', department: 'Sales' },
        { status: 400, json: [json.exists('errors.email')] },
      ),
    ]),
    test('required-fields', 'validation', 'reports every missing field', [
      http.post(
        '/api/employees',
        {},
        {
          status: 400,
          json: [
            json.exists('errors.name'),
            json.exists('errors.email'),
            json.exists('errors.department'),
          ],
        },
      ),
      http.post(
        '/api/employees',
        { name: '   ', email: 'blank@example.com', department: 'Sales' },
        { status: 400, json: [json.exists('errors.name')] },
      ),
    ]),
    test('department-rules', 'validation', 'accepts only the listed departments, exactly', [
      http.post(
        '/api/employees',
        { name: 'A', email: 'legal@example.com', department: 'Legal' },
        { status: 400, json: [json.exists('errors.department')] },
      ),
      http.post(
        '/api/employees',
        { name: 'A', email: 'lower@example.com', department: 'engineering' },
        { status: 400, json: [json.exists('errors.department')] },
      ),
    ]),
    test('name-length', 'validation', 'allows names up to 100 characters', [
      http.post(
        '/api/employees',
        { name: 'x'.repeat(101), email: 'long@example.com', department: 'Sales' },
        { status: 400, json: [json.exists('errors.name')] },
      ),
      http.post(
        '/api/employees',
        { name: 'y'.repeat(100), email: 'long@example.com', department: 'Sales' },
        { status: 201 },
      ),
    ]),
    test('invalid-json', 'validation', 'rejects a body that is not JSON', [
      http.post('/api/employees', '{"name": "Broken"', { status: 400 }),
    ]),
    test('no-side-effects', 'validation', 'does not store anything for invalid input', [
      http.post(
        '/api/employees',
        { name: 'Ghost', email: 'ghost@example.com', department: 'Legal' },
        { status: 400 },
      ),
      http.get('/api/employees', {
        status: 200,
        json: [json.notContains('', { email: 'ghost@example.com' })],
      }),
    ]),
    test('more-not-found', 'not-found', 'answers 404 for ids that never existed', [
      http.get('/api/employees/0', { status: 404 }),
      http.get('/api/employees/4000000', { status: 404 }),
    ]),
  ],
  implementations: [
    implementation(dir, {
      framework: 'aspnetcore',
      status: 'available',
      runtime: '.NET 10 · ASP.NET Core 10 (controllers)',
      database: 'in-memory',
      editable: ['Controllers/EmployeesController.cs', 'Services/EmployeeService.cs'],
      entryFile: 'Controllers/EmployeesController.cs',
    }),
    implementation(dir, {
      framework: 'spring-boot',
      status: 'available',
      runtime: 'Java 21 · Spring Boot 4.1 (Spring MVC)',
      database: 'in-memory',
      editable: [
        'src/main/java/com/pracstack/employees/web/EmployeeController.java',
        'src/main/java/com/pracstack/employees/service/EmployeeService.java',
      ],
      entryFile: 'src/main/java/com/pracstack/employees/web/EmployeeController.java',
      spring: { mainClass: 'com.pracstack.employees.EmployeeApplication', librarySet: 'core' },
    }),
    implementation(dir, {
      framework: 'django',
      status: 'available',
      runtime: 'Python 3.14 · Django 5.2 LTS · Django REST Framework 3.16',
      database: 'sqlite',
      editable: ['employees/views.py', 'employees/serializers.py'],
      entryFile: 'employees/views.py',
    }),
  ],
};

export const mutants: readonly Mutant[] = [
  ...readMutants(dir, 'aspnetcore'),
  ...readMutants(dir, 'spring-boot'),
  ...readMutants(dir, 'django'),
];
