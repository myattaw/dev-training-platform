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
 * Pagination and Sorting: page through a read-only order history with
 * validated page, pageSize, sort and direction parameters. One HTTP contract,
 * three framework implementations.
 */
const dir = challengeDir(import.meta.url);

/** `items.length` and the ids, in order, of the items on a page. */
const items = (...expected: number[]) => [
  json.equals('items.length', expected.length),
  ...expected.map((id, i) => json.equals(`items.${i}.id`, id)),
];

/** The paging numbers of a response. */
const paging = (page: number, pageSize: number, totalPages: number) => [
  json.equals('page', page),
  json.equals('pageSize', pageSize),
  json.equals('totalCount', 25),
  json.equals('totalPages', totalPages),
];

export const source: WebChallengeSource = {
  challenge: {
    id: 'pagination-sorting',
    version: 1,
    title: 'Pagination and Sorting',
    summary:
      'Page through an order history: validated page and pageSize, a whitelist of sort fields, stable ordering and correct totals.',
    difficulty: 'medium',
    category: 'rest-apis',
    estimatedMinutes: 45,
    access: 'free',
    competencies: ['rest-apis', 'pagination', 'sorting'],
    prerequisiteSkills: [],
    objectives: [
      'Return one page of a list together with page, pageSize, totalCount and totalPages.',
      'Compute the items of a page without off-by-one errors, including the last and beyond-the-last page.',
      'Sort only on a whitelist of fields, in both directions, with a tie-breaker that keeps the order stable.',
      'Validate paging and sorting parameters and report every invalid one with 400.',
    ],
    instructions: [
      {
        kind: 'paragraph',
        text: 'The customer service team browses the order history in a table with page buttons and sortable columns. The endpoint currently ignores its query parameters and always returns the first ten orders. Your job is to return one page at a time, sorted the way the table asks, with the numbers the table needs to draw its page buttons. The order history is read-only.',
      },
      {
        kind: 'paragraph',
        text: 'An order is `{ "id", "customer", "total", "orderDate", "status" }`, where `total` is a JSON number (for example `45.5`) and `orderDate` is a date string such as `2026-03-02`.',
      },
      { kind: 'heading', text: 'Requirements' },
      {
        kind: 'list',
        items: [
          '`GET /api/orders` returns 200 with `{ "items": [...], "page", "pageSize", "totalCount", "totalPages" }`. `totalCount` is the number of orders, and `totalPages` is `totalCount` divided by `pageSize`, rounded up.',
          'All four query parameters are optional. Leading and trailing spaces are ignored, and a missing or blank parameter takes its default: `page=1`, `pageSize=10`, `sort=id`, `direction=asc`.',
          '`page` is a whole number of at least 1. `pageSize` is a whole number from 1 to 50. Anything else (`0`, `-1`, `abc`, `1.5`, `51`) returns 400.',
          'Page 1 holds the first `pageSize` orders, page 2 the next ones, and so on. A page after the last one returns 200 with an empty `items` array and the correct `page`, `pageSize`, `totalCount` and `totalPages`.',
          '`sort` is exactly one of `id`, `customer`, `total`, `orderDate` (case matters). Any other value returns 400. `direction` is exactly `asc` or `desc`; any other value returns 400.',
          'The order must be stable: when two orders have the same value in the sort field, the one with the smaller `id` comes first, in both directions.',
          'Errors use the format `{ "errors": { "<parameter>": ["message", ...] } }` and list every invalid parameter (`page`, `pageSize`, `sort`, `direction`) at once.',
        ],
      },
      { kind: 'heading', text: 'How your API is tested' },
      {
        kind: 'paragraph',
        text: 'Your project is built and started in an isolated sandbox, and tests send it real HTTP requests, in order, against one running instance. Visible tests show their requests and expectations; hidden tests check edge cases and report only their category. JSON is compared by value: property order does not matter, and `120.00` equals `120`.',
      },
    ],
    endpoints: [
      {
        method: 'GET',
        path: '/api/orders',
        summary: 'The first page: 10 orders sorted by id.',
        responses: ['200 OK with { items, page, pageSize, totalCount, totalPages }'],
      },
      {
        method: 'GET',
        path: '/api/orders?page=2&pageSize=5&sort=total&direction=desc',
        summary: 'Any page, sorted by a whitelisted field in either direction.',
        responses: [
          '200 OK with { items, page, pageSize, totalCount, totalPages }',
          '400 Bad Request with { "errors": { ... } }',
        ],
      },
    ],
    hints: [
      'Validate all four parameters first and collect every message in a dictionary or map keyed by parameter name.',
      'Page `p` skips `(p - 1) * pageSize` orders and then takes `pageSize` of them.',
      'Round up with whole numbers: `(totalCount + pageSize - 1) / pageSize`.',
      'Map each allowed sort name to a field or comparator explicitly; never pass the raw parameter to the data layer.',
      'Reverse only the primary sort key for `desc`, then add `id` ascending as the second key.',
    ],
    visibleTests: [
      test('default-page', 'pagination', 'returns the first page of 10 orders sorted by id', [
        http.get('/api/orders', {
          status: 200,
          json: [
            ...paging(1, 10, 3),
            json.type('items', 'array'),
            json.equals('items.length', 10),
            json.equals('items.0.id', 1),
            json.equals('items.9.id', 10),
            json.contains('items', {
              id: 1,
              customer: 'Olivia Brown',
              total: 120,
              orderDate: '2026-03-02',
              status: 'Delivered',
            }),
          ],
        }),
      ]),
      test('second-page', 'pagination', 'returns the second page', [
        http.get('/api/orders?page=2&pageSize=10', {
          status: 200,
          json: [...paging(2, 10, 3), ...items(11, 12, 13, 14, 15, 16, 17, 18, 19, 20)],
        }),
      ]),
      test('sorted-by-total-desc', 'sorting', 'sorts by total, largest first, ties by id', [
        http.get('/api/orders?sort=total&direction=desc&pageSize=5', {
          status: 200,
          json: [...paging(1, 5, 5), ...items(8, 25, 18, 5, 22), json.equals('items.0.total', 300)],
        }),
      ]),
      test('rejects-large-page-size', 'validation', 'rejects a page size over 50', [
        http.get('/api/orders?pageSize=51', {
          status: 400,
          json: [json.exists('errors.pageSize'), json.absent('errors.page')],
        }),
      ]),
    ],
  },
  hiddenTests: [
    test('last-page-is-partial', 'pagination', 'returns the remaining orders on the last page', [
      http.get('/api/orders?page=3', {
        status: 200,
        json: [...paging(3, 10, 3), ...items(21, 22, 23, 24, 25)],
      }),
      http.get('/api/orders?page=4&pageSize=7', {
        status: 200,
        json: [...paging(4, 7, 4), ...items(22, 23, 24, 25)],
      }),
      http.get('/api/orders?page=3&pageSize=12', {
        status: 200,
        json: [...paging(3, 12, 3), ...items(25)],
      }),
    ]),
    test('page-beyond-last', 'pagination', 'returns an empty page after the last one', [
      http.get('/api/orders?page=4', {
        status: 200,
        json: [...paging(4, 10, 3), json.type('items', 'array'), json.equals('items.length', 0)],
      }),
      http.get('/api/orders?page=2&pageSize=50', {
        status: 200,
        json: [...paging(2, 50, 1), json.equals('items.length', 0)],
      }),
    ]),
    test('skip-take-exact', 'pagination', 'starts each page right after the previous one', [
      http.get('/api/orders?page=2&pageSize=5&sort=total', {
        status: 200,
        json: [...paging(2, 5, 5), ...items(2, 4, 9, 17, 24)],
      }),
      http.get('/api/orders?page=3&pageSize=4', {
        status: 200,
        json: [...paging(3, 4, 7), ...items(9, 10, 11, 12)],
      }),
    ]),
    test('largest-page-size', 'pagination', 'accepts page sizes from 1 to 50', [
      http.get('/api/orders?pageSize=50', {
        status: 200,
        json: [
          ...paging(1, 50, 1),
          json.equals('items.length', 25),
          json.equals('items.24.id', 25),
        ],
      }),
      http.get('/api/orders?pageSize=1&page=25', {
        status: 200,
        json: [...paging(25, 1, 25), ...items(25)],
      }),
    ]),
    test('ties-break-by-id', 'sorting', 'orders equal values by id, in both directions', [
      http.get('/api/orders?sort=total', {
        status: 200,
        json: items(21, 6, 15, 11, 19, 2, 4, 9, 17, 24),
      }),
      http.get('/api/orders?sort=total&direction=desc&page=2&pageSize=5', {
        status: 200,
        json: items(12, 1, 20, 23, 16),
      }),
      http.get('/api/orders?sort=customer&direction=desc&pageSize=6', {
        status: 200,
        json: items(8, 1, 6, 18, 4, 14),
      }),
    ]),
    test('sorts-every-field', 'sorting', 'sorts by each whitelisted field', [
      http.get('/api/orders?sort=customer&pageSize=4', {
        status: 200,
        json: [...items(20, 5, 15, 23), json.equals('items.0.customer', 'Amelia White')],
      }),
      http.get('/api/orders?sort=orderDate&direction=asc&pageSize=5', {
        status: 200,
        json: [...items(2, 5, 13, 1, 9), json.equals('items.3.orderDate', '2026-03-02')],
      }),
      http.get('/api/orders?sort=orderDate&direction=desc&pageSize=4', {
        status: 200,
        json: [...items(23, 25, 21, 19), json.equals('items.0.orderDate', '2026-03-15')],
      }),
      http.get('/api/orders?sort=id&direction=desc&pageSize=3', {
        status: 200,
        json: items(25, 24, 23),
      }),
    ]),
    test('invalid-numbers', 'validation', 'rejects page numbers and sizes that are not allowed', [
      http.get('/api/orders?page=0', { status: 400, json: [json.exists('errors.page')] }),
      http.get('/api/orders?page=-1', { status: 400, json: [json.exists('errors.page')] }),
      http.get('/api/orders?page=abc', { status: 400, json: [json.exists('errors.page')] }),
      http.get('/api/orders?page=1.5', { status: 400, json: [json.exists('errors.page')] }),
      http.get('/api/orders?pageSize=0', {
        status: 400,
        json: [json.exists('errors.pageSize'), json.absent('errors.page')],
      }),
      http.get('/api/orders?page=x&pageSize=ten', {
        status: 400,
        json: [json.exists('errors.page'), json.exists('errors.pageSize')],
      }),
    ]),
    test('sort-whitelist', 'validation', 'accepts only the listed sort fields and directions', [
      http.get('/api/orders?sort=status', { status: 400, json: [json.exists('errors.sort')] }),
      http.get('/api/orders?sort=Total', { status: 400, json: [json.exists('errors.sort')] }),
      http.get('/api/orders?sort=order_date', { status: 400, json: [json.exists('errors.sort')] }),
      http.get('/api/orders?direction=down', {
        status: 400,
        json: [json.exists('errors.direction'), json.absent('errors.sort')],
      }),
      http.get('/api/orders?sort=total&direction=DESC', {
        status: 400,
        json: [json.exists('errors.direction')],
      }),
      http.get('/api/orders?page=0&sort=price&direction=up', {
        status: 400,
        json: [
          json.exists('errors.page'),
          json.exists('errors.sort'),
          json.exists('errors.direction'),
        ],
      }),
    ]),
    test('defaults-and-blanks', 'edge-cases', 'uses the defaults for missing or blank parameters', [
      http.get('/api/orders?page=&pageSize=&sort=&direction=', {
        status: 200,
        json: [...paging(1, 10, 3), json.equals('items.0.id', 1), json.equals('items.length', 10)],
      }),
      http.get('/api/orders?direction=desc', {
        status: 200,
        json: [...paging(1, 10, 3), json.equals('items.0.id', 25), json.equals('items.9.id', 16)],
      }),
      http.get('/api/orders?sort=%20customer%20&page=%202%20', {
        status: 200,
        json: [...paging(2, 10, 3), json.equals('items.0.id', 22)],
      }),
    ]),
  ],
  implementations: [
    implementation(dir, {
      framework: 'aspnetcore',
      status: 'available',
      runtime: '.NET 10 · ASP.NET Core 10 (controllers)',
      database: 'in-memory',
      editable: ['Controllers/OrdersController.cs', 'Services/OrderService.cs'],
      entryFile: 'Services/OrderService.cs',
    }),
    implementation(dir, {
      framework: 'spring-boot',
      status: 'available',
      runtime: 'Java 21 · Spring Boot 4.1 (Spring MVC)',
      database: 'in-memory',
      editable: [
        'src/main/java/com/pracstack/orders/web/OrderController.java',
        'src/main/java/com/pracstack/orders/service/OrderService.java',
      ],
      entryFile: 'src/main/java/com/pracstack/orders/service/OrderService.java',
      spring: { mainClass: 'com.pracstack.orders.OrderApplication', librarySet: 'core' },
    }),
    implementation(dir, {
      framework: 'django',
      status: 'available',
      runtime: 'Python 3.14 · Django 5.2 LTS · Django REST Framework 3.16',
      database: 'sqlite',
      editable: ['orders/views.py'],
      entryFile: 'orders/views.py',
    }),
  ],
};

export const mutants: readonly Mutant[] = [
  ...readMutants(dir, 'aspnetcore'),
  ...readMutants(dir, 'spring-boot'),
  ...readMutants(dir, 'django'),
];
