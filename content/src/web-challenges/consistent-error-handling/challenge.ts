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
 * Implement Consistent Error Handling: an inventory API whose services throw
 * on purpose (not found, conflict, invalid input) and whose supplier
 * integration fails. The learner writes ONE central handler per framework
 * (IExceptionHandler, @RestControllerAdvice, DRF EXCEPTION_HANDLER) that
 * answers every error in the documented format and never leaks internals.
 * Hidden tests compare whole error bodies, so any extra field (stack trace,
 * exception type, internal message) fails them.
 */
const dir = challengeDir(import.meta.url);

const INTERNAL = { error: { code: 'internal', message: 'An unexpected error occurred.' } };
const UNREADABLE = {
  error: { code: 'validation_failed', message: 'The request body could not be read.', fields: {} },
};
const notFound = (sku: string) => ({
  error: { code: 'not_found', message: `Item ${sku} was not found.` },
});
const conflict = (message: string) => ({ error: { code: 'conflict', message } });

export const source: WebChallengeSource = {
  challenge: {
    id: 'consistent-error-handling',
    version: 1,
    title: 'Implement Consistent Error Handling',
    summary:
      'An inventory API leaks stack traces and answers every failure differently. Add one central error handler that maps each failure to the documented format and status code, and never reveals internals.',
    difficulty: 'medium',
    category: 'backend',
    estimatedMinutes: 45,
    access: 'free',
    competencies: ['error-handling', 'rest-apis', 'security'],
    prerequisiteSkills: [],
    objectives: [
      'Handle errors in one central place instead of in every controller or view.',
      'Map domain failures to 400, 404, 409 and 500 with a consistent JSON error format.',
      'Turn framework errors (unreadable request bodies, unknown routes) into the right responses.',
      'Keep stack traces, exception types and internal messages on the server, out of responses.',
    ],
    instructions: [
      {
        kind: 'paragraph',
        text: 'A warehouse team runs a small inventory API: items with a `sku`, a `name` and a `quantity` in stock. The services already enforce the rules and throw on purpose when something is wrong, and controllers or views never catch anything. The only error handling is a temporary debugging handler that answers 500 for everything and shows exception messages, types and stack traces to any client. The front-end team needs one predictable error format, and the security review requires that internals never leave the server.',
      },
      {
        kind: 'paragraph',
        text: 'Replace the debugging handler with one central error-handling mechanism: an exception handler in `Errors/` (ASP.NET Core), the `@RestControllerAdvice` class (Spring Boot), or the function configured as DRF `EXCEPTION_HANDLER` (Django). Do not change the services, controllers or views.',
      },
      { kind: 'heading', text: 'Error format' },
      {
        kind: 'paragraph',
        text: 'Every error response has the JSON body `{ "error": { "code": "...", "message": "..." } }` and nothing else. Only `validation_failed` adds a third property, `fields`: an object mapping field names to lists of messages.',
      },
      {
        kind: 'list',
        items: [
          'Invalid input (`InvalidInputException` / `InvalidInputError`): 400, code `validation_failed`, the exception message, and `fields` from the exception.',
          'A request body that cannot be read (malformed JSON, or a value the framework cannot convert, such as text where a number is expected): 400, code `validation_failed`, message `The request body could not be read.`, and `fields` set to `{}`. Django checks types in the service, so there a wrong type is reported like other invalid input.',
          'An unknown item (`NotFoundException` / `NotFoundError`): 404, code `not_found`, and the exception message.',
          'A conflict (`ConflictException` / `ConflictError`), such as reserving more units than are in stock or creating a SKU that exists: 409, code `conflict`, and the exception message.',
          'Anything else is unexpected: 500, code `internal`, and exactly the message `An unexpected error occurred.`. Log the exception on the server instead.',
          'The messages of the not-found, conflict and invalid-input exceptions are written for clients and are safe to return. Never return any other exception message, an exception type name, a stack trace or a file path.',
          'Requests the framework rejects before your code runs (an unknown route, an unsupported method) keep their status code (404, 405), never 500, and must not reveal internals; using the error format for them is optional.',
          'Successful responses must not change.',
        ],
      },
      { kind: 'heading', text: 'How your API is tested' },
      {
        kind: 'paragraph',
        text: 'Your project is built and started in an isolated sandbox, and tests send it real HTTP requests, in order, against one running instance. Visible tests show their requests and expectations; hidden tests check edge cases and report only their category. Hidden tests compare whole error bodies, so an extra property fails them. JSON is compared by value: property order does not matter.',
      },
    ],
    endpoints: [
      {
        method: 'GET',
        path: '/api/items',
        summary: 'All items, ordered by SKU.',
        responses: ['200 OK with an array of { sku, name, quantity }'],
      },
      {
        method: 'GET',
        path: '/api/items/KBD-101',
        summary: 'One item.',
        responses: ['200 OK with the item', '404 not_found'],
      },
      {
        method: 'POST',
        path: '/api/items',
        summary:
          'Create an item. sku: three capital letters, a dash and three digits; name: 1-80 characters; quantity: a whole number from 0 to 10000.',
        exampleBody: JSON.stringify(
          { sku: 'DSK-404', name: 'Standing desk', quantity: 12 },
          null,
          2,
        ),
        responses: [
          '201 Created with Location and the item',
          '400 validation_failed with fields',
          '409 conflict when the SKU exists',
        ],
      },
      {
        method: 'POST',
        path: '/api/items/MON-202/reservations',
        summary:
          'Reserve units: quantity is a whole number of at least 1. Returns the updated item.',
        exampleBody: JSON.stringify({ quantity: 2 }, null, 2),
        responses: [
          '200 OK with the item',
          '400 validation_failed',
          '404 not_found',
          '409 conflict when not enough units are in stock',
        ],
      },
      {
        method: 'GET',
        path: '/api/items/CBL-303/supplier-quote',
        summary:
          'Asks the supplier for a quote. The supplier gateway is offline in this environment, so this always fails unexpectedly for an existing item.',
        responses: ['500 internal', '404 not_found'],
      },
    ],
    hints: [
      'Map each exception type to a status, a code and a message in one place; let everything else fall through to `internal`.',
      'Unreadable bodies never reach your controller or view: ASP.NET Core answers them through `ApiBehaviorOptions.InvalidModelStateResponseFactory`, Spring throws `HttpMessageNotReadableException`, and DRF raises `ParseError`.',
      'In Spring, a catch-all `@ExceptionHandler(Exception.class)` also receives framework errors such as `NoResourceFoundException` (unknown route); those implement `ErrorResponse` and carry their own status.',
      'Log the full exception for unexpected errors: the details belong in the server log, not in the response.',
    ],
    visibleTests: [
      test('lists-items', 'reading', 'lists the stocked items', [
        http.get('/api/items', {
          status: 200,
          json: [json.contains('', { sku: 'KBD-101', name: 'Mechanical keyboard', quantity: 25 })],
        }),
      ]),
      test('unknown-item', 'not-found', 'answers 404 not_found for an unknown item', [
        http.get('/api/items/ZZZ-999', {
          status: 404,
          json: [
            json.equals('error.code', 'not_found'),
            json.equals('error.message', 'Item ZZZ-999 was not found.'),
          ],
        }),
      ]),
      test('invalid-item', 'validation', 'answers 400 validation_failed with every invalid field', [
        http.post(
          '/api/items',
          { sku: 'keyboard', name: '', quantity: -1 },
          {
            status: 400,
            json: [
              json.equals('error.code', 'validation_failed'),
              json.equals('error.message', 'One or more fields are invalid.'),
              json.exists('error.fields.sku'),
              json.exists('error.fields.name'),
              json.exists('error.fields.quantity'),
            ],
          },
        ),
      ]),
      test('over-reservation', 'conflict', 'answers 409 conflict when stock is too low', [
        http.post(
          '/api/items/MON-202/reservations',
          { quantity: 1000 },
          {
            status: 409,
            json: [
              json.equals('error.code', 'conflict'),
              json.equals('error.message', 'Only 8 units of MON-202 are in stock.'),
            ],
          },
        ),
      ]),
      test('unexpected-error', 'internal', 'answers 500 internal with a generic message', [
        http.get('/api/items/KBD-101/supplier-quote', {
          status: 500,
          json: [
            json.equals('error.code', 'internal'),
            json.equals('error.message', 'An unexpected error occurred.'),
          ],
        }),
      ]),
    ],
  },
  hiddenTests: [
    test(
      'internal-reveals-nothing',
      'no-leaks',
      'an unexpected error reveals nothing but the generic message',
      [
        http.get('/api/items/CBL-303/supplier-quote', {
          status: 500,
          json: [json.equals('', INTERNAL)],
        }),
      ],
    ),
    test('not-found-body', 'not-found', 'every not-found error has exactly the documented body', [
      http.get('/api/items/NOP-404', { status: 404, json: [json.equals('', notFound('NOP-404'))] }),
      http.post(
        '/api/items/NOP-405/reservations',
        { quantity: 1 },
        { status: 404, json: [json.equals('', notFound('NOP-405'))] },
      ),
      http.get('/api/items/NOP-406/supplier-quote', {
        status: 404,
        json: [json.equals('', notFound('NOP-406'))],
      }),
    ]),
    test('conflict-body', 'conflict', 'conflicts have exactly the documented body', [
      http.post(
        '/api/items',
        { sku: 'CAM-501', name: 'Webcam', quantity: 3 },
        {
          status: 201,
          json: [json.equals('', { sku: 'CAM-501', name: 'Webcam', quantity: 3 })],
        },
      ),
      http.post(
        '/api/items/CAM-501/reservations',
        { quantity: 4 },
        { status: 409, json: [json.equals('', conflict('Only 3 units of CAM-501 are in stock.'))] },
      ),
      http.post(
        '/api/items/CAM-501/reservations',
        { quantity: 3 },
        { status: 200, json: [json.equals('quantity', 0)] },
      ),
      http.post(
        '/api/items/CAM-501/reservations',
        { quantity: 1 },
        { status: 409, json: [json.equals('', conflict('Only 0 units of CAM-501 are in stock.'))] },
      ),
      http.post(
        '/api/items',
        { sku: 'CAM-501', name: 'Another webcam', quantity: 9 },
        { status: 409, json: [json.equals('', conflict('Item CAM-501 already exists.'))] },
      ),
    ]),
    test('validation-body', 'validation', 'validation errors have exactly the documented body', [
      http.post(
        '/api/items',
        { sku: 'abc-123', name: 'Desk lamp', quantity: 5 },
        {
          status: 400,
          json: [
            json.equals('', {
              error: {
                code: 'validation_failed',
                message: 'One or more fields are invalid.',
                fields: { sku: ['SKU must look like ABC-123.'] },
              },
            }),
          ],
        },
      ),
      http.post(
        '/api/items/KBD-101/reservations',
        { quantity: 0 },
        {
          status: 400,
          json: [
            json.equals('', {
              error: {
                code: 'validation_failed',
                message: 'One or more fields are invalid.',
                fields: { quantity: ['Quantity must be a whole number of at least 1.'] },
              },
            }),
          ],
        },
      ),
    ]),
    test('validation-every-field', 'validation', 'lists every missing field', [
      http.post(
        '/api/items',
        {},
        {
          status: 400,
          json: [
            json.equals('error.code', 'validation_failed'),
            json.exists('error.fields.sku'),
            json.exists('error.fields.name'),
            json.exists('error.fields.quantity'),
          ],
        },
      ),
      http.post(
        '/api/items/KBD-101/reservations',
        {},
        {
          status: 400,
          json: [
            json.equals('error.code', 'validation_failed'),
            json.exists('error.fields.quantity'),
          ],
        },
      ),
    ]),
    test(
      'unreadable-body',
      'validation',
      'answers malformed JSON with validation_failed and no parser details',
      [
        http.post('/api/items', '{"sku": "BAD', {
          status: 400,
          json: [json.equals('', UNREADABLE)],
        }),
        http.post('/api/items/KBD-101/reservations', '{"quantity": ', {
          status: 400,
          json: [json.equals('', UNREADABLE)],
        }),
      ],
    ),
    test('wrong-type', 'validation', 'answers a value of the wrong type with validation_failed', [
      http.post(
        '/api/items/KBD-101/reservations',
        { quantity: 'two' },
        {
          status: 400,
          json: [
            json.equals('error.code', 'validation_failed'),
            json.type('error.message', 'string'),
            json.type('error.fields', 'object'),
          ],
        },
      ),
      http.get('/api/items/KBD-101', { status: 200, json: [json.equals('quantity', 25)] }),
    ]),
    test(
      'framework-errors',
      'routing',
      'unknown routes and unsupported methods keep their status',
      [
        http.get('/api/warehouses', { status: 404 }),
        http.get('/api/items/KBD-101/history', { status: 404 }),
        http.delete('/api/items/KBD-101', { status: 405 }),
      ],
    ),
    test('success-unchanged', 'success', 'successful requests still work', [
      http.post(
        '/api/items',
        { sku: 'DSK-404', name: '  Standing desk ', quantity: 12 },
        {
          status: 201,
          json: [json.equals('', { sku: 'DSK-404', name: 'Standing desk', quantity: 12 })],
          headers: [{ name: 'Location', matches: '/api/items/DSK-404$' }],
        },
      ),
      http.post(
        '/api/items/DSK-404/reservations',
        { quantity: 5 },
        {
          status: 200,
          json: [json.equals('', { sku: 'DSK-404', name: 'Standing desk', quantity: 7 })],
        },
      ),
      http.get('/api/items/DSK-404', { status: 200, json: [json.equals('quantity', 7)] }),
    ]),
  ],
  implementations: [
    implementation(dir, {
      framework: 'aspnetcore',
      status: 'available',
      runtime: '.NET 10 · ASP.NET Core 10 (controllers)',
      database: 'in-memory',
      editable: ['Errors/ErrorHandling.cs', 'Errors/ApiExceptionHandler.cs'],
      entryFile: 'Errors/ErrorHandling.cs',
    }),
    implementation(dir, {
      framework: 'spring-boot',
      status: 'available',
      runtime: 'Java 21 · Spring Boot 4.1 (Spring MVC)',
      database: 'in-memory',
      editable: ['src/main/java/com/pracstack/inventory/web/ApiExceptionHandler.java'],
      entryFile: 'src/main/java/com/pracstack/inventory/web/ApiExceptionHandler.java',
      spring: { mainClass: 'com.pracstack.inventory.InventoryApplication', librarySet: 'core' },
    }),
    implementation(dir, {
      framework: 'django',
      status: 'available',
      runtime: 'Python 3.14 · Django 5.2 LTS · Django REST Framework 3.16',
      database: 'sqlite',
      editable: ['inventory/exceptions.py'],
      entryFile: 'inventory/exceptions.py',
    }),
  ],
};

export const mutants: readonly Mutant[] = [
  ...readMutants(dir, 'aspnetcore'),
  ...readMutants(dir, 'spring-boot'),
  ...readMutants(dir, 'django'),
];
