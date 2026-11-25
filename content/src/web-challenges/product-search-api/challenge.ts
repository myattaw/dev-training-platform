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
 * Product Search API: a read-only catalog searched with optional query
 * parameters. One HTTP contract, three framework implementations.
 */
const dir = challengeDir(import.meta.url);

/** `length` and the ids, in order, of a product list. */
const ids = (...expected: number[]) => [
  json.equals('length', expected.length),
  ...expected.map((id, i) => json.equals(`${i}.id`, id)),
];

export const source: WebChallengeSource = {
  challenge: {
    id: 'product-search-api',
    version: 1,
    title: 'Product Search API',
    summary:
      'Add search to a product catalog: optional query parameters for name, category and price range, validated input and predictable results.',
    difficulty: 'easy',
    category: 'rest-apis',
    estimatedMinutes: 30,
    access: 'free',
    competencies: ['rest-apis', 'query-parameters', 'input-validation'],
    prerequisiteSkills: [],
    objectives: [
      'Read optional query parameters and treat missing or blank ones as "no filter".',
      'Combine several filters so a product must match all of them.',
      'Validate numeric query parameters and report every invalid one with 400.',
      'Return deterministic results: the same request always gives the same list in the same order.',
    ],
    instructions: [
      {
        kind: 'paragraph',
        text: 'An online store shows its catalog on a search page. The catalog service already lists all fifteen products, but the search page needs to narrow the list by name, category and price. Your job is to add the search parameters and the single-product endpoint. The catalog is read-only: nothing in this challenge creates or changes products.',
      },
      {
        kind: 'paragraph',
        text: 'A product is returned as `{ "id", "name", "category", "price", "inStock" }`. `price` is a JSON number with at most two decimal places, for example `19.99`. The categories are `Electronics`, `Office`, `Kitchen` and `Outdoor`.',
      },
      { kind: 'heading', text: 'Requirements' },
      {
        kind: 'list',
        items: [
          '`GET /api/products` returns 200 with an array of the products that match every given filter, ordered by id. No match is an empty array, not an error.',
          'All four query parameters are optional. Leading and trailing spaces are ignored, and a parameter that is missing or blank (for example `?q=`) means no filter.',
          '`q`: the product name contains this text, ignoring upper and lower case (`lamp` matches `Desk Lamp`).',
          '`category`: the category is exactly this value, including case (`kitchen` matches nothing).',
          '`minPrice` and `maxPrice`: the price is at least `minPrice` and at most `maxPrice` (both bounds are inclusive).',
          'A price parameter must be a decimal number: an optional minus sign, digits, and optionally a dot followed by digits (`20`, `19.99`). Anything else returns 400. A negative price returns 400. When both are valid and `minPrice` is greater than `maxPrice`, return 400 with the error under `maxPrice`.',
          'Errors use the format `{ "errors": { "<parameter>": ["message", ...] } }` and list every invalid parameter (`minPrice`, `maxPrice`) at once.',
          '`GET /api/products/{id}` returns 200 with the product, or 404 when there is none.',
        ],
      },
      { kind: 'heading', text: 'How your API is tested' },
      {
        kind: 'paragraph',
        text: 'Your project is built and started in an isolated sandbox, and tests send it real HTTP requests, in order, against one running instance. Visible tests show their requests and expectations; hidden tests check edge cases and report only their category. JSON is compared by value: property order does not matter, and `89.00` equals `89`.',
      },
    ],
    endpoints: [
      {
        method: 'GET',
        path: '/api/products',
        summary: 'All products, ordered by id.',
        responses: ['200 OK with an array of products'],
      },
      {
        method: 'GET',
        path: '/api/products?q=lamp',
        summary: 'Products whose name contains "lamp", ignoring case.',
        responses: ['200 OK with an array of products'],
      },
      {
        method: 'GET',
        path: '/api/products?category=Electronics&minPrice=20&maxPrice=50',
        summary: 'Combine filters: a product must match all of them.',
        responses: [
          '200 OK with an array of products',
          '400 Bad Request with { "errors": { ... } }',
        ],
      },
      {
        method: 'GET',
        path: '/api/products/7',
        summary: 'One product.',
        responses: ['200 OK with the product', '404 Not Found'],
      },
    ],
    hints: [
      'Read every parameter as text first, so you decide what counts as invalid instead of the framework.',
      'Validate both prices before you filter, collect the messages in a dictionary or map keyed by parameter name, and return them all at once.',
      'Start from the full list and apply one filter per given parameter; skip a filter when its parameter is missing or blank.',
      'Compare prices as decimals, not floating-point numbers, so `19.99` is exactly `19.99`.',
    ],
    visibleTests: [
      test('lists-all-products', 'reading', 'lists every product, ordered by id', [
        http.get('/api/products', {
          status: 200,
          json: [
            json.type('', 'array'),
            json.equals('length', 15),
            json.equals('0.id', 1),
            json.contains('', {
              id: 1,
              name: 'Wireless Mouse',
              category: 'Electronics',
              price: 24.99,
              inStock: true,
            }),
          ],
        }),
      ]),
      test('searches-by-name', 'search', 'finds products by part of their name', [
        http.get('/api/products?q=lamp', {
          status: 200,
          json: [
            ...ids(5, 15),
            json.contains('', { id: 5, name: 'Desk Lamp' }),
            json.contains('', { id: 15, name: 'Lamp Oil Refill' }),
          ],
        }),
      ]),
      test('filters-by-category-and-price', 'search', 'combines a category and a maximum price', [
        http.get('/api/products?category=Electronics&maxPrice=50', {
          status: 200,
          json: ids(1, 3),
        }),
      ]),
      test('gets-one-product', 'reading', 'returns one product by id', [
        http.get('/api/products/7', {
          status: 200,
          json: [
            json.equals('id', 7),
            json.equals('name', 'Standing Desk Mat'),
            json.equals('category', 'Office'),
            json.equals('price', 19.99),
            json.equals('inStock', true),
          ],
        }),
      ]),
      test('unknown-product', 'not-found', 'returns 404 for an unknown product', [
        http.get('/api/products/999', { status: 404 }),
      ]),
      test('rejects-invalid-price', 'validation', 'rejects a price that is not a number', [
        http.get('/api/products?minPrice=cheap', {
          status: 400,
          json: [json.exists('errors.minPrice'), json.absent('errors.maxPrice')],
        }),
      ]),
    ],
  },
  hiddenTests: [
    test('name-search-ignores-case', 'search', 'matches names regardless of case', [
      http.get('/api/products?q=LAMP', { status: 200, json: ids(5, 15) }),
      http.get('/api/products?q=sKiLLeT', { status: 200, json: ids(10) }),
      http.get('/api/products?q=zzz', { status: 200, json: [json.equals('length', 0)] }),
    ]),
    test('category-is-exact', 'search', 'matches the category exactly, including case', [
      http.get('/api/products?category=Kitchen', { status: 200, json: ids(9, 10, 11) }),
      http.get('/api/products?category=kitchen', {
        status: 200,
        json: [json.equals('length', 0)],
      }),
      http.get('/api/products?category=Kitch', { status: 200, json: [json.equals('length', 0)] }),
    ]),
    test('price-bounds-inclusive', 'search', 'includes products priced exactly at a bound', [
      http.get('/api/products?minPrice=19.99&maxPrice=19.99', {
        status: 200,
        json: ids(7, 11),
      }),
      http.get('/api/products?minPrice=199.99', { status: 200, json: ids(4, 6) }),
      http.get('/api/products?maxPrice=12.50', { status: 200, json: ids(8, 15) }),
    ]),
    test('combined-filters', 'search', 'requires every filter to match', [
      http.get('/api/products?q=desk&category=Office', { status: 200, json: ids(5, 7) }),
      http.get('/api/products?q=e&category=Outdoor&minPrice=15&maxPrice=30', {
        status: 200,
        json: ids(12, 14),
      }),
      http.get('/api/products?minPrice=100', { status: 200, json: ids(4, 6, 13) }),
    ]),
    test(
      'blank-parameters-ignored',
      'edge-cases',
      'treats blank parameters as missing and trims values',
      [
        http.get('/api/products?q=&category=&minPrice=&maxPrice=', {
          status: 200,
          json: [json.equals('length', 15)],
        }),
        http.get('/api/products?q=%20desk%20&category=%20Office%20', {
          status: 200,
          json: ids(5, 7),
        }),
        http.get('/api/products?minPrice=%2089%20&maxPrice=89', { status: 200, json: ids(2) }),
      ],
    ),
    test('price-values', 'edge-cases', 'returns prices as numbers with their exact value', [
      http.get('/api/products/8', {
        status: 200,
        json: [json.equals('price', 12.5), json.equals('inStock', true)],
      }),
      http.get('/api/products/2', { status: 200, json: [json.equals('price', 89)] }),
      http.get('/api/products/3', {
        status: 200,
        json: [json.equals('price', 39.5), json.equals('inStock', false)],
      }),
    ]),
    test('negative-prices', 'validation', 'rejects negative prices', [
      http.get('/api/products?maxPrice=-5', {
        status: 400,
        json: [json.exists('errors.maxPrice'), json.absent('errors.minPrice')],
      }),
      http.get('/api/products?minPrice=-0.01', {
        status: 400,
        json: [json.exists('errors.minPrice')],
      }),
    ]),
    test('not-a-number', 'validation', 'rejects malformed numbers and reports every one', [
      http.get('/api/products?minPrice=12abc', {
        status: 400,
        json: [json.exists('errors.minPrice')],
      }),
      http.get('/api/products?maxPrice=1.2.3', {
        status: 400,
        json: [json.exists('errors.maxPrice')],
      }),
      http.get('/api/products?minPrice=five&maxPrice=ten', {
        status: 400,
        json: [json.exists('errors.minPrice'), json.exists('errors.maxPrice')],
      }),
    ]),
    test('min-greater-than-max', 'validation', 'rejects a price range that is upside down', [
      http.get('/api/products?minPrice=50&maxPrice=20', {
        status: 400,
        json: [json.exists('errors.maxPrice')],
      }),
      http.get('/api/products?minPrice=20&maxPrice=50', {
        status: 200,
        json: ids(1, 3, 5, 10, 12),
      }),
    ]),
    test('more-not-found', 'not-found', 'answers 404 for ids that do not exist', [
      http.get('/api/products/0', { status: 404 }),
      http.get('/api/products/16', { status: 404 }),
    ]),
  ],
  implementations: [
    implementation(dir, {
      framework: 'aspnetcore',
      status: 'available',
      runtime: '.NET 10 · ASP.NET Core 10 (controllers)',
      database: 'in-memory',
      editable: ['Controllers/ProductsController.cs', 'Services/ProductSearchService.cs'],
      entryFile: 'Controllers/ProductsController.cs',
    }),
    implementation(dir, {
      framework: 'spring-boot',
      status: 'available',
      runtime: 'Java 21 · Spring Boot 4.1 (Spring MVC)',
      database: 'in-memory',
      editable: [
        'src/main/java/com/pracstack/products/web/ProductController.java',
        'src/main/java/com/pracstack/products/service/ProductSearchService.java',
      ],
      entryFile: 'src/main/java/com/pracstack/products/web/ProductController.java',
      spring: { mainClass: 'com.pracstack.products.ProductApplication', librarySet: 'core' },
    }),
    implementation(dir, {
      framework: 'django',
      status: 'available',
      runtime: 'Python 3.14 · Django 5.2 LTS · Django REST Framework 3.16',
      database: 'sqlite',
      editable: ['products/views.py'],
      entryFile: 'products/views.py',
    }),
  ],
};

export const mutants: readonly Mutant[] = [
  ...readMutants(dir, 'aspnetcore'),
  ...readMutants(dir, 'spring-boot'),
  ...readMutants(dir, 'django'),
];
