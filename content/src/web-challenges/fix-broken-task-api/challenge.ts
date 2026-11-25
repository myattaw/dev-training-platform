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
 * Fix a Broken Application: a complete, running task-tracking API with five
 * realistic bugs spread over the controller/view, the service and the query
 * code. The same five bugs exist in every framework:
 *
 * 1. POST /api/tasks answers 200 without a Location header instead of 201.
 * 2. The status filter is inverted (it removes the matching tasks).
 * 3. A blank title passes validation (only a missing title is rejected).
 * 4. Changing the status is applied to a copy and never stored.
 * 5. "Overdue" includes tasks due today (<= instead of <).
 */
const dir = challengeDir(import.meta.url);

const venue = { title: 'Book venue for offsite', assignee: 'li', dueDate: '2026-04-02' };

export const source: WebChallengeSource = {
  challenge: {
    id: 'fix-broken-task-api',
    version: 1,
    title: 'Fix a Broken Application',
    summary:
      'A task-tracking API builds and runs, but users keep reporting wrong results. Reproduce the reports, find the bugs and fix them with small, focused changes.',
    difficulty: 'medium',
    category: 'debugging',
    estimatedMinutes: 45,
    access: 'free',
    competencies: ['debugging', 'rest-apis'],
    prerequisiteSkills: [],
    objectives: [
      'Reproduce a reported problem with real HTTP requests before changing code.',
      'Trace a request through the controller or view, the service and the query code.',
      'Recognize common bug patterns: inverted conditions, off-by-one comparisons, changes applied to a copy, missing validation, wrong status codes.',
      'Fix each bug with a small change without breaking behavior that already works.',
    ],
    instructions: [
      {
        kind: 'paragraph',
        text: 'Your team runs a small task tracker used by several internal tools. The API builds, starts and mostly works, but support has received several bug reports since the last release, and some client applications behave strangely. The original developer has left. Your job is to make the API match its contract below.',
      },
      {
        kind: 'paragraph',
        text: 'The contract is the source of truth: the code contains several bugs where it does something else. Use the HTTP client to compare real responses with the contract, read the code to find the cause, and fix it. You do not need to restructure anything: every bug can be fixed with a small edit in an editable file.',
      },
      { kind: 'heading', text: 'The task resource' },
      {
        kind: 'list',
        items: [
          'A task has `id` (number), `title` (string), `status` (`open`, `in_progress` or `done`), `assignee` (string or null) and `dueDate` (an ISO date string such as `2026-03-20`, or null).',
          'The service works with a fixed business date, today = `2026-03-15`, defined in a read-only configuration file. Do not change it.',
          'A task is overdue when it has a due date strictly before today and its status is not `done`. A task due today is not overdue yet; a task without a due date is never overdue.',
        ],
      },
      { kind: 'heading', text: 'The contract' },
      {
        kind: 'list',
        items: [
          '`GET /api/tasks` returns 200 with all tasks ordered by id. `?status=<status>` returns only the tasks with exactly that status. `?overdue=true` returns only the overdue tasks. Both filters can be combined, and then a task must match both.',
          '`GET /api/tasks/{id}` returns 200 with the task, or 404 when there is none.',
          '`POST /api/tasks` with a JSON body `{ "title", "assignee", "dueDate" }` creates a task with status `open` and returns 201 Created, a `Location` header ending in `/api/tasks/{id}`, and the new task.',
          '`title` is required: it is trimmed and must then contain 1 to 200 characters. `assignee` and `dueDate` are optional. `dueDate`, when given, must be a valid date in the format `yyyy-MM-dd`.',
          '`PUT /api/tasks/{id}/status` with a JSON body `{ "status" }` changes the status of a task and returns 200 with the updated task. The status must be exactly one of `open`, `in_progress`, `done`. The change is stored: later requests see it. An unknown task returns 404.',
          'Invalid input returns 400 with a JSON body `{ "errors": { "<field>": ["message", ...] } }` (fields `title`, `dueDate`, `status`) and changes nothing.',
        ],
      },
      { kind: 'heading', text: 'How your API is tested' },
      {
        kind: 'paragraph',
        text: 'Your project is built and started in an isolated sandbox, and tests send it real HTTP requests, in order, against one running instance. Visible tests show their requests and expectations; hidden tests check the rest of the contract and report only their category. Some bugs are only caught by hidden tests, so check every rule of the contract yourself. JSON is compared by value: property order does not matter.',
      },
    ],
    endpoints: [
      {
        method: 'GET',
        path: '/api/tasks?status=open&overdue=true',
        summary: 'Tasks ordered by id; both filters are optional.',
        responses: ['200 OK with an array of tasks'],
      },
      {
        method: 'GET',
        path: '/api/tasks/2',
        summary: 'One task.',
        responses: ['200 OK with the task', '404 Not Found'],
      },
      {
        method: 'POST',
        path: '/api/tasks',
        summary: 'Create a task (status open).',
        exampleBody: JSON.stringify(venue, null, 2),
        responses: [
          '201 Created with Location and the task',
          '400 Bad Request with { "errors": { ... } }',
        ],
      },
      {
        method: 'PUT',
        path: '/api/tasks/5/status',
        summary: 'Change the status of a task.',
        exampleBody: JSON.stringify({ status: 'in_progress' }, null, 2),
        responses: [
          '200 OK with the updated task',
          '400 Bad Request with { "errors": { "status": [...] } }',
          '404 Not Found',
        ],
      },
    ],
    hints: [
      'Reproduce each report with the HTTP client first: compare the response with the contract, then follow the request from the controller or view into the service and the query code.',
      'Look closely at conditions: a filter that removes items keeps the opposite of what its condition says, and `<=` versus `<` matters at a boundary.',
      'If a change looks right in the response but is gone on the next request, check whether the code changes the stored object or only a copy of it.',
      'Validation that checks only for a missing value lets an empty or whitespace-only value through.',
      'Creating a resource has its own status code and a header that points to the new resource.',
    ],
    visibleTests: [
      test('lists-tasks', 'reading', 'lists the stored tasks', [
        http.get('/api/tasks', {
          status: 200,
          json: [
            json.type('', 'array'),
            json.contains('', {
              id: 1,
              title: 'Write release notes',
              status: 'open',
              assignee: 'maria',
              dueDate: '2026-03-10',
            }),
            json.contains('', { id: 6, status: 'done', assignee: null, dueDate: null }),
          ],
        }),
      ]),
      test('gets-one-task', 'reading', 'returns one task by id, or 404', [
        http.get('/api/tasks/2', {
          status: 200,
          json: [
            json.equals('id', 2),
            json.equals('title', 'Fix login timeout'),
            json.equals('status', 'in_progress'),
            json.equals('dueDate', '2026-03-14'),
          ],
        }),
        http.get('/api/tasks/999999', { status: 404 }),
      ]),
      test('creates-task', 'creating', 'creates an open task and reads it back', [
        http.post('/api/tasks', venue, {
          status: 201,
          json: [
            json.type('id', 'number'),
            json.equals('title', 'Book venue for offsite'),
            json.equals('status', 'open'),
            json.equals('assignee', 'li'),
            json.equals('dueDate', '2026-04-02'),
          ],
          headers: [{ name: 'Location', matches: '/api/tasks/\\d+$' }],
          capture: { id: 'id' },
        }),
        http.get('/api/tasks/{{id}}', {
          status: 200,
          json: [json.equals('title', 'Book venue for offsite'), json.equals('status', 'open')],
        }),
      ]),
      test('filters-by-status', 'filtering', 'returns only the tasks with the requested status', [
        http.get('/api/tasks?status=done', {
          status: 200,
          json: [
            json.contains('', { id: 4, status: 'done' }),
            json.contains('', { id: 6, status: 'done' }),
            json.notContains('', { status: 'open' }),
            json.notContains('', { status: 'in_progress' }),
          ],
        }),
      ]),
      test(
        'lists-overdue',
        'filtering',
        'returns overdue tasks and leaves out done and future ones',
        [
          http.get('/api/tasks?overdue=true', {
            status: 200,
            json: [
              json.contains('', { id: 1 }),
              json.contains('', { id: 2 }),
              json.notContains('', { id: 4 }),
              json.notContains('', { id: 5 }),
              json.notContains('', { id: 6 }),
            ],
          }),
        ],
      ),
    ],
  },
  hiddenTests: [
    test(
      'overdue-boundary',
      'edge-cases',
      'a task due today is not overdue, one due yesterday is',
      [
        http.get('/api/tasks?overdue=true', {
          status: 200,
          json: [json.notContains('', { id: 3 }), json.notContains('', { id: 7 })],
        }),
        http.post(
          '/api/tasks',
          { title: 'Renew TLS certificate', dueDate: '2026-03-14' },
          { status: 201 },
        ),
        http.post(
          '/api/tasks',
          { title: 'Order team lunch', dueDate: '2026-03-15' },
          { status: 201 },
        ),
        http.get('/api/tasks?overdue=true', {
          status: 200,
          json: [
            json.contains('', { title: 'Renew TLS certificate' }),
            json.notContains('', { title: 'Order team lunch' }),
          ],
        }),
      ],
    ),
    test('blank-title', 'validation', 'rejects a missing, empty or whitespace-only title', [
      http.post(
        '/api/tasks',
        { assignee: 'ghost-missing' },
        { status: 400, json: [json.exists('errors.title')] },
      ),
      http.post(
        '/api/tasks',
        { title: '', assignee: 'ghost-empty' },
        { status: 400, json: [json.exists('errors.title')] },
      ),
      http.post(
        '/api/tasks',
        { title: '   ', assignee: 'ghost-blank' },
        { status: 400, json: [json.exists('errors.title')] },
      ),
      http.get('/api/tasks', {
        status: 200,
        json: [
          json.notContains('', { assignee: 'ghost-empty' }),
          json.notContains('', { assignee: 'ghost-blank' }),
        ],
      }),
    ]),
    test('status-change-persists', 'persistence', 'a status change is stored', [
      http.post(
        '/api/tasks',
        { title: 'Migrate CI runners' },
        { status: 201, capture: { id: 'id' } },
      ),
      http.put(
        '/api/tasks/{{id}}/status',
        { status: 'done' },
        { status: 200, json: [json.equals('status', 'done')] },
      ),
      http.get('/api/tasks/{{id}}', {
        status: 200,
        json: [json.equals('status', 'done'), json.equals('title', 'Migrate CI runners')],
      }),
      http.get('/api/tasks?status=done', {
        status: 200,
        json: [json.contains('', { title: 'Migrate CI runners', status: 'done' })],
      }),
    ]),
    test(
      'done-is-not-overdue',
      'business-rules',
      'completing an overdue task removes it from the overdue list',
      [
        http.post(
          '/api/tasks',
          { title: 'Send March invoices', dueDate: '2026-03-02' },
          { status: 201, capture: { id: 'id' } },
        ),
        http.get('/api/tasks?overdue=true', {
          status: 200,
          json: [json.contains('', { title: 'Send March invoices' })],
        }),
        http.put('/api/tasks/{{id}}/status', { status: 'done' }, { status: 200 }),
        http.get('/api/tasks?overdue=true', {
          status: 200,
          json: [json.notContains('', { title: 'Send March invoices' })],
        }),
      ],
    ),
    test('in-progress-filter', 'filtering', 'filters by in_progress', [
      http.get('/api/tasks?status=in_progress', {
        status: 200,
        json: [
          json.contains('', { id: 2 }),
          json.contains('', { id: 7 }),
          json.notContains('', { status: 'open' }),
          json.notContains('', { status: 'done' }),
        ],
      }),
    ]),
    test('combined-filters', 'filtering', 'combines the status and overdue filters', [
      http.get('/api/tasks?status=open&overdue=true', {
        status: 200,
        json: [
          json.contains('', { id: 1 }),
          json.notContains('', { id: 2 }),
          json.notContains('', { id: 3 }),
          json.notContains('', { id: 5 }),
        ],
      }),
    ]),
    test('invalid-status', 'validation', 'accepts only the exact status values', [
      http.put(
        '/api/tasks/5/status',
        { status: 'finished' },
        { status: 400, json: [json.exists('errors.status')] },
      ),
      http.put(
        '/api/tasks/5/status',
        { status: 'Done' },
        { status: 400, json: [json.exists('errors.status')] },
      ),
      http.get('/api/tasks/5', { status: 200, json: [json.equals('status', 'open')] }),
    ]),
    test('due-date-format', 'validation', 'rejects due dates that are not valid yyyy-MM-dd dates', [
      http.post(
        '/api/tasks',
        { title: 'Impossible date', dueDate: '2026-02-30' },
        { status: 400, json: [json.exists('errors.dueDate'), json.absent('errors.title')] },
      ),
      http.post(
        '/api/tasks',
        { title: 'Wrong format', dueDate: '15/03/2026' },
        { status: 400, json: [json.exists('errors.dueDate')] },
      ),
    ]),
    test('trims-title', 'validation', 'trims the title; assignee and due date are optional', [
      http.post(
        '/api/tasks',
        { title: '  Call the vendor  ' },
        {
          status: 201,
          json: [
            json.equals('title', 'Call the vendor'),
            json.equals('status', 'open'),
            json.equals('assignee', null),
            json.equals('dueDate', null),
          ],
        },
      ),
    ]),
    test('title-length', 'validation', 'allows titles up to 200 characters', [
      http.post(
        '/api/tasks',
        { title: 'x'.repeat(201) },
        { status: 400, json: [json.exists('errors.title')] },
      ),
      http.post('/api/tasks', { title: 'y'.repeat(200) }, { status: 201 }),
    ]),
    test('more-not-found', 'not-found', 'answers 404 for unknown tasks', [
      http.get('/api/tasks/0', { status: 404 }),
      http.put('/api/tasks/999999/status', { status: 'done' }, { status: 404 }),
    ]),
  ],
  implementations: [
    implementation(dir, {
      framework: 'aspnetcore',
      status: 'available',
      runtime: '.NET 10 · ASP.NET Core 10 (controllers)',
      database: 'in-memory',
      editable: [
        'Controllers/TasksController.cs',
        'Services/TaskService.cs',
        'Data/TaskRepository.cs',
      ],
      entryFile: 'Controllers/TasksController.cs',
    }),
    implementation(dir, {
      framework: 'spring-boot',
      status: 'available',
      runtime: 'Java 21 · Spring Boot 4.1 (Spring MVC)',
      database: 'in-memory',
      editable: [
        'src/main/java/com/pracstack/tasks/web/TaskController.java',
        'src/main/java/com/pracstack/tasks/service/TaskService.java',
        'src/main/java/com/pracstack/tasks/data/TaskRepository.java',
      ],
      entryFile: 'src/main/java/com/pracstack/tasks/web/TaskController.java',
      spring: { mainClass: 'com.pracstack.tasks.TaskApplication', librarySet: 'core' },
    }),
    implementation(dir, {
      framework: 'django',
      status: 'available',
      runtime: 'Python 3.14 · Django 5.2 LTS · Django REST Framework 3.16',
      database: 'sqlite',
      editable: ['tasks/views.py', 'tasks/serializers.py', 'tasks/services.py'],
      entryFile: 'tasks/views.py',
    }),
  ],
};

export const mutants: readonly Mutant[] = [
  ...readMutants(dir, 'aspnetcore'),
  ...readMutants(dir, 'spring-boot'),
  ...readMutants(dir, 'django'),
];
