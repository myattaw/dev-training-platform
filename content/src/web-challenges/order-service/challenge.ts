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
 * Implement an Order Service: validation with per-line errors, stock checks
 * across the whole order, exact decimal arithmetic, a discount rule with
 * half-up rounding, and all-or-nothing stock updates. Products 5, 7 and 8 have
 * small, dedicated stock levels so tests can check stock without depending on
 * each other: product 6 is used only by the visible order test, product 7 is
 * never ordered successfully, product 5 never has enough stock, and product 8
 * is used only by the same-product test.
 */
const dir = challengeDir(import.meta.url);

const order = (customerId: string, lines: readonly [number, number][]) => ({
  customerId,
  lines: lines.map(([productId, quantity]) => ({ productId, quantity })),
});

export const source: WebChallengeSource = {
  challenge: {
    id: 'order-service',
    version: 1,
    title: 'Implement an Order Service',
    summary:
      'Take orders for an office-supplies shop: validate every line, check stock, compute exact totals with a volume discount, and update stock all or nothing.',
    difficulty: 'medium',
    category: 'business-logic',
    estimatedMinutes: 45,
    access: 'free',
    competencies: ['business-logic', 'rest-apis', 'input-validation'],
    prerequisiteSkills: [],
    objectives: [
      'Validate a nested request body and report errors per line.',
      'Compute money amounts with exact decimal arithmetic and an explicit rounding rule.',
      'Apply a business rule at its exact boundary.',
      'Change several records atomically: a failed order changes nothing.',
      'Choose between 400 (invalid input) and 409 (a valid request that conflicts with the current state).',
    ],
    instructions: [
      {
        kind: 'paragraph',
        text: 'An office-supplies shop is moving its order intake to a new service. The product catalog is ready and can be read through the API. Your job is to implement placing an order and reading it back, with the rules the finance and warehouse teams agreed on.',
      },
      { kind: 'heading', text: 'Placing an order' },
      {
        kind: 'list',
        items: [
          '`POST /api/orders` with a JSON body `{ "customerId": "C-1001", "lines": [{ "productId": 6, "quantity": 3 }] }`.',
          '`customerId` is required: it is trimmed and must then contain 1 to 50 characters.',
          '`lines` must contain at least one line. Every line needs the `productId` of an existing product and a whole-number `quantity` from 1 to 100.',
          'Invalid input returns 400 with `{ "errors": { ... } }` and changes nothing. Report every problem at once: `errors.customerId` is a list of messages; errors for a line are under `errors.lines`, one object per submitted line in the same order (an empty object for a valid line), for example `{ "errors": { "lines": [ {}, { "productId": ["Unknown product."] } ] } }` when the second line names an unknown product. When `lines` is missing or empty, the response has an `errors.lines` entry.',
          'Stock is checked only for valid input. If the same product appears in several lines, their quantities add up. When a product does not have enough stock, return 409 Conflict with `{ "message": "...", "productId": <id> }` naming the first such product in line order.',
          'A failed order (400 or 409) changes no stock at all. A successful order reduces the stock of every product it contains in one step.',
          'A successful order returns 201 Created, a `Location` header ending in `/api/orders/{id}`, and the order.',
        ],
      },
      { kind: 'heading', text: 'Amounts' },
      {
        kind: 'list',
        items: [
          'Each line has `unitPrice` (the product price) and `lineTotal` = `unitPrice` × `quantity`.',
          '`subtotal` is the sum of the line totals.',
          'Volume discount: when the subtotal is 200.00 or more, `discount` is 10% of the subtotal, rounded half-up to 2 decimal places (20.025 becomes 20.03). Otherwise `discount` is 0.',
          '`total` = `subtotal` − `discount`.',
          'All amounts are exact: use a decimal type, never binary floating point (0.10 × 3 must be 0.30, not 0.30000000000000004). They are JSON numbers with 2 decimal places.',
        ],
      },
      { kind: 'heading', text: 'Reading' },
      {
        kind: 'list',
        items: [
          'An order is `{ "id", "customerId", "lines": [{ "productId", "productName", "quantity", "unitPrice", "lineTotal" }], "subtotal", "discount", "total" }`, with lines in the order they were submitted.',
          '`GET /api/orders/{id}` returns 200 with the order, or 404.',
          '`GET /api/products` and `GET /api/products/{id}` (already implemented) return products as `{ "id", "name", "unitPrice", "stock" }`; `stock` shows what is left after orders.',
        ],
      },
      { kind: 'heading', text: 'How your API is tested' },
      {
        kind: 'paragraph',
        text: 'Your project is built and started in an isolated sandbox, and tests send it real HTTP requests, in order, against one running instance. Visible tests show their requests and expectations; hidden tests check other amounts, boundaries and failure cases and report only their category. JSON is compared by value: numbers compare numerically and property order does not matter.',
      },
    ],
    endpoints: [
      {
        method: 'GET',
        path: '/api/products',
        summary: 'All products with their current stock (already implemented).',
        responses: ['200 OK with an array of products'],
      },
      {
        method: 'GET',
        path: '/api/products/6',
        summary: 'One product with its current stock (already implemented).',
        responses: ['200 OK with the product', '404 Not Found'],
      },
      {
        method: 'POST',
        path: '/api/orders',
        summary: 'Place an order.',
        exampleBody: JSON.stringify(
          order('C-1001', [
            [6, 3],
            [2, 10],
          ]),
          null,
          2,
        ),
        responses: [
          '201 Created with Location and the order',
          '400 Bad Request with { "errors": { ... } }',
          '409 Conflict with { "message", "productId" } when stock is insufficient',
        ],
      },
      {
        method: 'GET',
        path: '/api/orders/1',
        summary: 'One order.',
        responses: ['200 OK with the order', '404 Not Found'],
      },
    ],
    hints: [
      'Validate first and collect every error; only then look at stock. Nothing may change before every check has passed.',
      'Add up the quantities per product before checking stock: two lines of 3 need 6 in stock.',
      'Use `decimal` (C#), `BigDecimal` (Java) or `Decimal` (Python) for every amount, and round only the discount, with an explicit half-up rounding mode. The default rounding in .NET and Python is half-even (banker’s rounding).',
      'Check stock and reduce it inside one lock or database transaction so that two orders cannot both take the last item.',
      'Compare the subtotal with 200.00 using "or more", not "more than".',
    ],
    visibleTests: [
      test('lists-products', 'reading', 'lists products and reads one', [
        http.get('/api/products', {
          status: 200,
          json: [
            json.type('', 'array'),
            json.contains('', { id: 1, name: 'USB-C Cable', unitPrice: 19.99 }),
            json.contains('', { id: 2, name: 'Cable Tie', unitPrice: 0.1 }),
          ],
        }),
        http.get('/api/products/5', {
          status: 200,
          json: [
            json.equals('name', 'Limited Edition Mouse'),
            json.equals('unitPrice', 35),
            json.equals('stock', 3),
          ],
        }),
        http.get('/api/products/999999', { status: 404 }),
      ]),
      test('creates-order', 'creating', 'places an order, reads it back and reduces stock', [
        http.post('/api/orders', order('C-1001', [[6, 3]]), {
          status: 201,
          json: [
            json.type('id', 'number'),
            json.equals('customerId', 'C-1001'),
            json.equals('lines.length', 1),
            json.equals('lines.0.productId', 6),
            json.equals('lines.0.productName', 'Webcam'),
            json.equals('lines.0.quantity', 3),
            json.equals('lines.0.unitPrice', 64.95),
            json.equals('lines.0.lineTotal', 194.85),
            json.equals('subtotal', 194.85),
            json.equals('discount', 0),
            json.equals('total', 194.85),
          ],
          headers: [{ name: 'Location', matches: '/api/orders/\\d+$' }],
          capture: { id: 'id' },
        }),
        http.get('/api/orders/{{id}}', {
          status: 200,
          json: [json.equals('customerId', 'C-1001'), json.equals('total', 194.85)],
        }),
        http.get('/api/products/6', { status: 200, json: [json.equals('stock', 37)] }),
      ]),
      test('applies-discount', 'business-rules', 'gives 10% off a subtotal of 200.00 or more', [
        http.post(
          '/api/orders',
          order('C-1002', [
            [4, 1],
            [1, 1],
          ]),
          {
            status: 201,
            json: [
              json.equals('subtotal', 219.98),
              json.equals('discount', 22),
              json.equals('total', 197.98),
            ],
          },
        ),
      ]),
      test('rejects-invalid-order', 'validation', 'reports invalid fields, per line', [
        http.post(
          '/api/orders',
          order('', [
            [1, 2],
            [1, 0],
          ]),
          {
            status: 400,
            json: [
              json.exists('errors.customerId'),
              json.exists('errors.lines.1.quantity'),
              json.absent('errors.lines.0.quantity'),
            ],
          },
        ),
      ]),
      test('insufficient-stock', 'stock', 'rejects an order that needs more than the stock', [
        http.post('/api/orders', order('C-1003', [[5, 4]]), {
          status: 409,
          json: [json.equals('productId', 5)],
        }),
        http.get('/api/products/5', { status: 200, json: [json.equals('stock', 3)] }),
      ]),
      test('unknown-order', 'not-found', 'returns 404 for an unknown order', [
        http.get('/api/orders/999999', { status: 404 }),
      ]),
    ],
  },
  hiddenTests: [
    test(
      'exact-decimal-arithmetic',
      'arithmetic',
      'computes amounts without floating-point errors',
      [
        http.post('/api/orders', order('C-2001', [[2, 3]]), {
          status: 201,
          json: [
            json.equals('lines.0.lineTotal', 0.3),
            json.equals('subtotal', 0.3),
            json.equals('discount', 0),
            json.equals('total', 0.3),
          ],
        }),
        http.post(
          '/api/orders',
          order('C-2002', [
            [1, 3],
            [2, 7],
          ]),
          {
            status: 201,
            json: [
              json.equals('lines.0.lineTotal', 59.97),
              json.equals('lines.1.lineTotal', 0.7),
              json.equals('subtotal', 60.67),
              json.equals('total', 60.67),
            ],
          },
        ),
      ],
    ),
    test('discount-boundary', 'business-rules', 'applies the discount from exactly 200.00', [
      http.post('/api/orders', order('C-2101', [[3, 4]]), {
        status: 201,
        json: [
          json.equals('subtotal', 200),
          json.equals('discount', 20),
          json.equals('total', 180),
        ],
      }),
      http.post('/api/orders', order('C-2102', [[4, 1]]), {
        status: 201,
        json: [
          json.equals('subtotal', 199.99),
          json.equals('discount', 0),
          json.equals('total', 199.99),
        ],
      }),
    ]),
    test('discount-rounding', 'business-rules', 'rounds the discount half-up to 2 places', [
      http.post(
        '/api/orders',
        order('C-2201', [
          [1, 5],
          [3, 2],
          [2, 3],
        ]),
        {
          status: 201,
          json: [
            json.equals('subtotal', 200.25),
            json.equals('discount', 20.03),
            json.equals('total', 180.22),
          ],
        },
      ),
    ]),
    test(
      'failed-order-changes-nothing',
      'atomicity',
      'a rejected order leaves every stock level unchanged',
      [
        http.get('/api/products/7', { status: 200, json: [json.equals('stock', 10)] }),
        http.post(
          '/api/orders',
          order('C-2301', [
            [7, 2],
            [5, 50],
          ]),
          { status: 409, json: [json.equals('productId', 5)] },
        ),
        http.get('/api/products/7', { status: 200, json: [json.equals('stock', 10)] }),
        http.get('/api/products/5', { status: 200, json: [json.equals('stock', 3)] }),
      ],
    ),
    test('same-product-lines', 'stock', 'adds up quantities of the same product across lines', [
      http.get('/api/products/8', { status: 200, json: [json.equals('stock', 5)] }),
      http.post(
        '/api/orders',
        order('C-2401', [
          [8, 3],
          [8, 3],
        ]),
        { status: 409, json: [json.equals('productId', 8)] },
      ),
      http.get('/api/products/8', { status: 200, json: [json.equals('stock', 5)] }),
      http.post(
        '/api/orders',
        order('C-2402', [
          [8, 2],
          [8, 3],
        ]),
        {
          status: 201,
          json: [json.equals('lines.length', 2), json.equals('subtotal', 124.95)],
        },
      ),
      http.get('/api/products/8', { status: 200, json: [json.equals('stock', 0)] }),
      http.post('/api/orders', order('C-2403', [[8, 1]]), {
        status: 409,
        json: [json.equals('productId', 8)],
      }),
    ]),
    test('line-validation', 'validation', 'validates the list of lines and every line', [
      http.post(
        '/api/orders',
        { customerId: 'C-2501' },
        { status: 400, json: [json.exists('errors.lines'), json.absent('errors.customerId')] },
      ),
      http.post(
        '/api/orders',
        { customerId: 'C-2501', lines: [] },
        { status: 400, json: [json.exists('errors.lines')] },
      ),
      http.post(
        '/api/orders',
        order('C-2501', [
          [1, 1],
          [999999, 1],
        ]),
        {
          status: 400,
          json: [json.exists('errors.lines.1.productId'), json.absent('errors.lines.0.productId')],
        },
      ),
      http.post(
        '/api/orders',
        { customerId: 'C-2501', lines: [{ productId: 1 }] },
        { status: 400, json: [json.exists('errors.lines.0.quantity')] },
      ),
      http.post(
        '/api/orders',
        { customerId: 'C-2501', lines: [{ quantity: 1 }] },
        { status: 400, json: [json.exists('errors.lines.0.productId')] },
      ),
      http.post('/api/orders', order('C-2501', [[2, 101]]), {
        status: 400,
        json: [json.exists('errors.lines.0.quantity')],
      }),
    ]),
    test('quantity-bounds', 'validation', 'accepts quantities from 1 to 100', [
      http.post('/api/orders', order('C-2601', [[2, 100]]), {
        status: 201,
        json: [json.equals('subtotal', 10), json.equals('total', 10)],
      }),
      http.post('/api/orders', order('C-2602', [[2, 1]]), {
        status: 201,
        json: [json.equals('total', 0.1)],
      }),
    ]),
    test(
      'customer-validation',
      'validation',
      'trims the customer id and requires 1 to 50 characters',
      [
        http.post(
          '/api/orders',
          { lines: [{ productId: 1, quantity: 1 }] },
          { status: 400, json: [json.exists('errors.customerId')] },
        ),
        http.post('/api/orders', order('   ', [[1, 1]]), {
          status: 400,
          json: [json.exists('errors.customerId')],
        }),
        http.post('/api/orders', order('C'.repeat(51), [[1, 1]]), {
          status: 400,
          json: [json.exists('errors.customerId')],
        }),
        http.post('/api/orders', order('  C-2701 ', [[1, 1]]), {
          status: 201,
          json: [json.equals('customerId', 'C-2701')],
        }),
      ],
    ),
    test('invalid-order-changes-nothing', 'validation', 'an invalid order leaves stock unchanged', [
      http.post(
        '/api/orders',
        order('C-2801', [
          [7, 1],
          [7, 0],
        ]),
        { status: 400 },
      ),
      http.post('/api/orders', order('', [[7, 1]]), { status: 400 }),
      http.get('/api/products/7', { status: 200, json: [json.equals('stock', 10)] }),
    ]),
    test('order-readback', 'reading', 'stores the order with its lines in order', [
      http.post(
        '/api/orders',
        order('C-2901', [
          [3, 1],
          [1, 2],
        ]),
        { status: 201, capture: { id: 'id' } },
      ),
      http.get('/api/orders/{{id}}', {
        status: 200,
        json: [
          json.equals('customerId', 'C-2901'),
          json.equals('lines.length', 2),
          json.equals('lines.0.productId', 3),
          json.equals('lines.0.productName', 'Notebook'),
          json.equals('lines.1.productId', 1),
          json.equals('lines.1.quantity', 2),
          json.equals('lines.1.unitPrice', 19.99),
          json.equals('lines.1.lineTotal', 39.98),
          json.equals('subtotal', 89.98),
          json.equals('discount', 0),
          json.equals('total', 89.98),
        ],
      }),
    ]),
    test('more-not-found', 'not-found', 'answers 404 for unknown orders and products', [
      http.get('/api/orders/0', { status: 404 }),
      http.get('/api/products/0', { status: 404 }),
    ]),
    test('invalid-json', 'validation', 'rejects a body that is not JSON', [
      http.post('/api/orders', '{"customerId": "C-3001"', { status: 400 }),
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
      editable: ['shop/views.py', 'shop/serializers.py', 'shop/services.py'],
      entryFile: 'shop/services.py',
    }),
  ],
};

export const mutants: readonly Mutant[] = [
  ...readMutants(dir, 'aspnetcore'),
  ...readMutants(dir, 'spring-boot'),
  ...readMutants(dir, 'django'),
];
