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
 * Dependency Injection Troubleshooting: a quote and notification service whose
 * container wiring is broken. The starter builds and starts, but one endpoint
 * fails with 500 (a missing registration), quotes leak lines between requests
 * (a stateful service with the wrong lifetime, captured by a singleton), and
 * the wrong discount policy is injected (two candidates, the wrong one wins).
 * ASP.NET Core and Spring Boot only: Django has no dependency injection
 * container, so this challenge is specific to those frameworks.
 */
const dir = challengeDir(import.meta.url);

const quote = (lines: readonly { sku: string; quantity: number }[]) => ({ lines });

export const source: WebChallengeSource = {
  challenge: {
    id: 'dependency-injection-troubleshooting',
    version: 1,
    title: 'Dependency Injection Troubleshooting',
    summary:
      'Fix the container wiring of a quote service: a missing registration, a stateful service with the wrong lifetime, and the wrong implementation injected.',
    difficulty: 'medium',
    category: 'architecture',
    estimatedMinutes: 40,
    access: 'free',
    competencies: ['dependency-injection', 'debugging', 'backend-development'],
    prerequisiteSkills: [],
    objectives: [
      'Diagnose a 500 caused by a service that was never registered with the container.',
      'Choose service lifetimes so per-request state is never shared between requests.',
      'Recognize a captive dependency: a long-lived service holding a shorter-lived one.',
      'Control which implementation is injected when several candidates exist.',
    ],
    instructions: [
      {
        kind: 'paragraph',
        text: 'The sales team uses an internal service to price quotes and notify customers. After a refactoring of the application wiring, support received three tickets: sending a notification always fails with 500 Internal Server Error, a second quote sometimes contains the lines of earlier quotes, and large orders no longer get the volume discount. The controllers, the catalog and the outbox are correct and read-only. The bugs are in how services are registered with the dependency injection container and in the classes that the container builds.',
      },
      { kind: 'heading', text: 'Requirements' },
      {
        kind: 'list',
        items: [
          '`GET /api/health` returns 200 with `{ "status": "ok" }` (already works).',
          '`POST /api/quotes` with `{ "lines": [{ "sku", "quantity" }] }` returns 200 with `lines` (each with `sku`, `quantity`, `unitPriceCents`, `lineTotalCents`), `subtotalCents`, `discountCents` and `totalCents`. Every quote contains only the lines of its own request.',
          'Unknown products, a missing or empty `lines` array, or a quantity outside 1–999 return 400 with `{ "errors": { "lines": [...] } }` (already implemented by the controller).',
          'The volume discount applies: 10% off when the subtotal is at least 10000 cents, rounded down to a whole cent; otherwise the discount is 0. `totalCents` is `subtotalCents - discountCents`. The pilot policy, which never discounts, must not be used.',
          '`POST /api/notifications` with `{ "recipient", "message" }` sends the notification by email and returns 201 with `id`, `channel` (`email`), `recipient` and `message`. A blank `recipient` or `message` returns 400 with `{ "errors": { ... } }`.',
          '`GET /api/notifications` lists every notification sent.',
          'Prices (cents): `PEN-01` 250, `NB-A5` 899, `DESK-LAMP` 4599, `CHAIR-ERG` 18900.',
        ],
      },
      { kind: 'heading', text: 'Where to look' },
      {
        kind: 'paragraph',
        text: 'In ASP.NET Core, every application service is registered in `Composition/ServiceRegistration.cs`. In Spring Boot, beans are discovered from their stereotype annotations (`@Component`, `@Service`) and their scope; fix the annotated classes. You do not need to change the controllers.',
      },
      { kind: 'heading', text: 'How your API is tested' },
      {
        kind: 'paragraph',
        text: 'Your project is built and started in an isolated sandbox, and tests send it real HTTP requests, in order, against one running instance. Several tests send quotes one after another, so state that survives from one request to the next is detected. Visible tests show their requests and expectations; hidden tests report only their category. JSON is compared by value: property order does not matter.',
      },
    ],
    endpoints: [
      {
        method: 'GET',
        path: '/api/health',
        summary: 'Health check (already works).',
        responses: ['200 OK with { "status": "ok" }'],
      },
      {
        method: 'POST',
        path: '/api/quotes',
        summary: 'Price a quote.',
        exampleBody: JSON.stringify(
          quote([
            { sku: 'NB-A5', quantity: 2 },
            { sku: 'PEN-01', quantity: 3 },
          ]),
          null,
          2,
        ),
        responses: ['200 OK with the priced quote', '400 Bad Request with { "errors": { "lines": [...] } }'],
      },
      {
        method: 'POST',
        path: '/api/notifications',
        summary: 'Send a notification by email.',
        exampleBody: JSON.stringify(
          { recipient: 'buyer@example.com', message: 'Your quote is ready.' },
          null,
          2,
        ),
        responses: ['201 Created with the notification', '400 Bad Request with { "errors": { ... } }'],
      },
      {
        method: 'GET',
        path: '/api/notifications',
        summary: 'Every notification sent.',
        responses: ['200 OK with an array of notifications'],
      },
    ],
    hints: [
      'Read the application output after a failing request: the container names the service it could not resolve.',
      'A service that keeps per-request state must be created per request (scoped in ASP.NET Core, prototype or request scope in Spring), and nothing longer-lived may hold on to it.',
      'Changing the stateful class alone is not enough if a singleton received one instance at startup: the singleton keeps that instance. In Spring, ask an `ObjectProvider` for a new instance per call, or use a scoped proxy.',
      'With two registrations of the same interface, ASP.NET Core injects the last one. In Spring, `@Primary` or `@Qualifier` decides between candidates.',
    ],
    visibleTests: [
      test('health', 'reading', 'answers the health check', [
        http.get('/api/health', { status: 200, json: [json.equals('status', 'ok')] }),
      ]),
      test('prices-a-quote', 'pricing', 'prices a small quote without discount', [
        http.post(
          '/api/quotes',
          quote([
            { sku: 'NB-A5', quantity: 2 },
            { sku: 'PEN-01', quantity: 3 },
          ]),
          {
            status: 200,
            json: [
              json.equals('lines.length', 2),
              json.contains('lines', {
                sku: 'NB-A5',
                quantity: 2,
                unitPriceCents: 899,
                lineTotalCents: 1798,
              }),
              json.contains('lines', { sku: 'PEN-01', quantity: 3, lineTotalCents: 750 }),
              json.equals('subtotalCents', 2548),
              json.equals('discountCents', 0),
              json.equals('totalCents', 2548),
            ],
          },
        ),
      ]),
      test('volume-discount', 'pricing', 'applies the volume discount to a large order', [
        http.post('/api/quotes', quote([{ sku: 'CHAIR-ERG', quantity: 1 }]), {
          status: 200,
          json: [
            json.equals('lines.length', 1),
            json.equals('subtotalCents', 18900),
            json.equals('discountCents', 1890),
            json.equals('totalCents', 17010),
          ],
        }),
      ]),
      test('sends-notification', 'notifications', 'sends a notification by email', [
        http.post(
          '/api/notifications',
          { recipient: 'buyer@example.com', message: 'Your quote is ready.' },
          {
            status: 201,
            json: [
              json.type('id', 'number'),
              json.equals('channel', 'email'),
              json.equals('recipient', 'buyer@example.com'),
              json.equals('message', 'Your quote is ready.'),
            ],
          },
        ),
      ]),
    ],
  },
  hiddenTests: [
    test('repeated-quote-is-stable', 'state-leak', 'returns the same quote for the same request', [
      http.post('/api/quotes', quote([{ sku: 'DESK-LAMP', quantity: 1 }]), {
        status: 200,
        json: [json.equals('lines.length', 1), json.equals('subtotalCents', 4599)],
      }),
      http.post('/api/quotes', quote([{ sku: 'DESK-LAMP', quantity: 1 }]), {
        status: 200,
        json: [
          json.equals('lines.length', 1),
          json.equals('subtotalCents', 4599),
          json.equals('totalCents', 4599),
        ],
      }),
    ]),
    test(
      'quotes-do-not-share-lines',
      'state-leak',
      'never includes lines from an earlier request',
      [
        http.post('/api/quotes', quote([{ sku: 'NB-A5', quantity: 1 }]), {
          status: 200,
          json: [json.equals('lines.length', 1)],
        }),
        http.post('/api/quotes', quote([{ sku: 'PEN-01', quantity: 2 }]), {
          status: 200,
          json: [
            json.equals('lines.length', 1),
            json.notContains('lines', { sku: 'NB-A5' }),
            json.equals('subtotalCents', 500),
          ],
        }),
      ],
    ),
    test('discount-threshold', 'wrong-implementation', 'starts the discount at exactly 10000 cents', [
      http.post('/api/quotes', quote([{ sku: 'PEN-01', quantity: 40 }]), {
        status: 200,
        json: [
          json.equals('subtotalCents', 10000),
          json.equals('discountCents', 1000),
          json.equals('totalCents', 9000),
        ],
      }),
      http.post('/api/quotes', quote([{ sku: 'PEN-01', quantity: 39 }]), {
        status: 200,
        json: [json.equals('subtotalCents', 9750), json.equals('discountCents', 0)],
      }),
    ]),
    test('discount-rounding', 'wrong-implementation', 'rounds the discount down to a whole cent', [
      http.post('/api/quotes', quote([{ sku: 'DESK-LAMP', quantity: 3 }]), {
        status: 200,
        json: [
          json.equals('subtotalCents', 13797),
          json.equals('discountCents', 1379),
          json.equals('totalCents', 12418),
        ],
      }),
    ]),
    test(
      'notification-is-recorded',
      'dependency-resolution',
      'records a sent notification in the outbox',
      [
        http.post(
          '/api/notifications',
          { recipient: '  procurement@example.org ', message: 'Quote 2 was updated.' },
          {
            status: 201,
            json: [json.equals('recipient', 'procurement@example.org'), json.equals('channel', 'email')],
            capture: { id: 'id' },
          },
        ),
        http.get('/api/notifications', {
          status: 200,
          json: [
            json.contains('', {
              recipient: 'procurement@example.org',
              channel: 'email',
              message: 'Quote 2 was updated.',
            }),
          ],
        }),
      ],
    ),
    test('notification-validation', 'validation', 'rejects a notification without a recipient', [
      http.post(
        '/api/notifications',
        { recipient: '   ', message: 'Hello' },
        { status: 400, json: [json.exists('errors.recipient')] },
      ),
      http.get('/api/notifications', {
        status: 200,
        json: [json.notContains('', { message: 'Hello' })],
      }),
    ]),
    test('quote-validation', 'validation', 'rejects unknown products and invalid quantities', [
      http.post('/api/quotes', quote([{ sku: 'SOFA-XL', quantity: 1 }]), {
        status: 400,
        json: [json.exists('errors.lines')],
      }),
      http.post('/api/quotes', quote([{ sku: 'PEN-01', quantity: 0 }]), {
        status: 400,
        json: [json.exists('errors.lines')],
      }),
      http.post('/api/quotes', { lines: [] }, { status: 400, json: [json.exists('errors.lines')] }),
      http.post('/api/quotes', quote([{ sku: 'NB-A5', quantity: 1 }]), {
        status: 200,
        json: [json.equals('lines.length', 1), json.equals('subtotalCents', 899)],
      }),
    ]),
  ],
  implementations: [
    implementation(dir, {
      framework: 'aspnetcore',
      status: 'available',
      runtime: '.NET 10 · ASP.NET Core 10 (controllers)',
      database: 'in-memory',
      editable: [
        'Composition/ServiceRegistration.cs',
        'Services/QuoteService.cs',
        'Services/QuoteBuilder.cs',
      ],
      entryFile: 'Composition/ServiceRegistration.cs',
    }),
    implementation(dir, {
      framework: 'spring-boot',
      status: 'available',
      runtime: 'Java 21 · Spring Boot 4.1 (Spring MVC)',
      database: 'in-memory',
      editable: [
        'src/main/java/com/pracstack/quotes/pricing/QuoteService.java',
        'src/main/java/com/pracstack/quotes/pricing/QuoteBuilder.java',
        'src/main/java/com/pracstack/quotes/pricing/VolumeDiscountPolicy.java',
        'src/main/java/com/pracstack/quotes/pricing/PilotNoDiscountPolicy.java',
        'src/main/java/com/pracstack/quotes/notifications/EmailNotificationSender.java',
      ],
      entryFile: 'src/main/java/com/pracstack/quotes/pricing/QuoteService.java',
      spring: { mainClass: 'com.pracstack.quotes.QuotesApplication', librarySet: 'core' },
    }),
  ],
};

export const mutants: readonly Mutant[] = [
  ...readMutants(dir, 'aspnetcore'),
  ...readMutants(dir, 'spring-boot'),
];
