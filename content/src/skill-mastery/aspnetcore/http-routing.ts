import type { QuestionSource } from '@pracstack/content-model';
import { csCompilesFamily } from '../csharp/builders';
import { cs, plain } from '../helpers';
import { choiceFamily, multiFamily, outputFamily, web } from './builders';

/*
 * HTTP and REST API design, minimal APIs and routing. HTTP programs host a real
 * ASP.NET Core app on loopback in the C# runner; their output is checked.
 */

// ================================================================ HTTP and REST

export const httpRestFamilies: readonly QuestionSource[] = [
  ...choiceFamily(
    'aspnet-http-status-basics',
    1,
    'Ask what happened to the resource, and whether the client needs anything back.',
    [
      {
        key: 'created',
        question:
          'A client sends a valid `POST /api/orders`, and the API stores the new order with id 1042 before responding. Which response fits HTTP semantics best?',
        code: plain(`POST /api/orders HTTP/1.1
Content-Type: application/json

{ "sku": "A1", "quantity": 2 }`),
        correct:
          '`201 Created` with a `Location: /api/orders/1042` header (and usually the new order in the body)',
        wrong: [
          '`200 OK` with an empty body',
          '`202 Accepted`, because a new resource was added',
          '`302 Found` redirecting the client to `/api/orders/1042`',
        ],
        why: '`201 Created` says a new resource now exists, and `Location` tells the client its URL, so it can fetch or link to it without guessing. `202 Accepted` is the tempting wrong answer: it means the work was queued and has not finished, which is not true here. A redirect makes the client issue a second request for no reason.',
      },
      {
        key: 'deleted',
        question:
          '`DELETE /api/orders/1042` succeeds: the order is removed and the API has nothing useful to return. Which response is the best fit?',
        correct: '`204 No Content`',
        wrong: [
          '`404 Not Found`, because the order no longer exists',
          '`201 Created`',
          '`202 Accepted`',
        ],
        why: '`204 No Content` reports success with an intentionally empty body. `404` describes a later `GET` (or a delete of an id that never existed), not the delete that just succeeded. `202` would claim the delete is still pending, and `201` is for creating resources.',
      },
      {
        key: 'missing',
        question:
          '`GET /api/orders/9999` is sent, and no order with id 9999 exists. Which response should the API return?',
        correct: '`404 Not Found`',
        wrong: ['`200 OK` with the body `null`', '`204 No Content`', '`400 Bad Request`'],
        why: 'The URL names a resource that does not exist, which is exactly `404 Not Found`. `200` with `null` and `204` both claim success and force clients to special-case an empty body. `400` means the request itself is malformed, but `9999` is a perfectly valid id.',
      },
    ],
  ),
  ...multiFamily(
    'aspnet-http-method-properties',
    2,
    'Safe means "no state change requested"; idempotent means "sending it twice has the same effect on the server as sending it once".',
    [
      {
        key: 'idempotent',
        question: 'Which HTTP methods are defined as idempotent?',
        right: ['`GET`', '`PUT`', '`DELETE`'],
        wrong: ['`POST`', '`PATCH`'],
        why: '`PUT` replaces the resource with the same representation every time and `DELETE` leaves it deleted, so repeating them changes nothing further; `GET` changes nothing at all. `POST` can create a new resource on every call. `PATCH` is not defined as idempotent: a patch such as "append an item" or "increment the counter" has a different effect each time.',
      },
      {
        key: 'safe',
        question:
          'Which HTTP methods are defined as safe (read-only from the client’s point of view)?',
        right: ['`GET`', '`HEAD`', '`OPTIONS`'],
        wrong: ['`PUT`', '`DELETE`', '`POST`'],
        why: 'Safe methods only retrieve information, so crawlers, prefetchers and caches may send them freely. `PUT` and `DELETE` are idempotent but not safe: they change state. Idempotent and safe are different properties; every safe method is idempotent, not the other way round.',
      },
    ],
  ),
  ...outputFamily(
    'aspnet-http-live-success',
    2,
    [
      'Look at which `Results`/`TypedResults` method each endpoint returns: each maps to a specific status code.',
    ],
    [
      {
        key: 'created',
        code: web({
          usings: ['System.Net.Http.Json'],
          app: `app.MapPost("/orders", (NewOrder order) =>
    TypedResults.Created("/orders/42", new { id = 42, order.Sku }));`,
          client: `var res = await http.PostAsJsonAsync("/orders", new { sku = "A1" });
Console.WriteLine((int)res.StatusCode);
Console.WriteLine(res.Headers.Location);
Console.WriteLine(await res.Content.ReadAsStringAsync());`,
          types: 'record NewOrder(string Sku);',
        }),
        output: '201\n/orders/42\n{"id":42,"sku":"A1"}',
        why: '`TypedResults.Created(uri, value)` sends `201 Created`, puts the URI in the `Location` header and serializes the value as the body. JSON property names are camel-cased by default (`id`, `sku`), and the C# property name `Sku` was copied from the bound request body.',
      },
      {
        key: 'no-content',
        code: web({
          app: `app.MapDelete("/orders/{id:int}", (int id) => Results.NoContent());`,
          client: `var res = await http.DeleteAsync("/orders/7");
Console.WriteLine((int)res.StatusCode);
Console.WriteLine((await res.Content.ReadAsStringAsync()).Length);`,
        }),
        output: '204\n0',
        why: '`Results.NoContent()` sends `204 No Content`: success, and by definition no body, so the content read by the client is empty.',
      },
      {
        key: 'ok-json',
        code: web({
          app: `app.MapGet("/orders/{id:int}", (int id) => new Order(id, "open"));`,
          client: `var res = await http.GetAsync("/orders/3");
Console.WriteLine((int)res.StatusCode);
Console.WriteLine(res.Content.Headers.ContentType);
Console.WriteLine(await res.Content.ReadAsStringAsync());`,
          types: 'record Order(int Id, string Status);',
        }),
        output: '200\napplication/json; charset=utf-8\n{"id":3,"status":"open"}',
        why: 'Returning a plain object from a minimal API handler means `200 OK` with the object serialized as JSON (`application/json; charset=utf-8`, camel-case property names). You only need `Results.Ok(...)` when other branches return different results.',
      },
    ],
  ),
  ...choiceFamily(
    'aspnet-http-retry-safety',
    3,
    'What happens on the server if the same request arrives twice?',
    [
      {
        key: 'timeout-retry',
        question:
          'A mobile client times out without seeing a response. Which of these requests can it simply send again, without risking a duplicated effect?',
        correct: '`PUT /api/customers/42/address` with the complete new address',
        wrong: [
          '`POST /api/payments` with `{ "amount": 50 }`',
          '`POST /api/carts/7/items` with `{ "sku": "A1" }`',
          '`PATCH /api/accounts/9` with `{ "op": "increment", "path": "/balance", "value": 10 }`',
        ],
        why: 'The `PUT` replaces the address with the same full representation, so applying it twice leaves the same state: it is idempotent. Each `POST` may create a second payment or cart line, and an "increment" patch adds 10 again. Idempotency is what makes blind retries safe.',
      },
      {
        key: 'unsafe-get',
        question:
          'After a link-preview service and a browser prefetcher were enabled, users complain that their orders get cancelled by themselves. Which endpoint is the likely cause?',
        correct: '`GET /api/orders/{id}/cancel`, which cancels the order',
        wrong: [
          '`POST /api/orders/{id}/cancellation`, which cancels the order',
          '`DELETE /api/orders/{id}`, which cancels the order',
          '`GET /api/orders/{id}`, which returns the order',
        ],
        why: '`GET` is defined as safe, so crawlers, link previews and prefetchers follow `GET` links freely, assuming nothing changes. A `GET` that cancels breaks that contract. `POST` and `DELETE` are not sent automatically by such tools, and a plain read does no harm.',
      },
    ],
  ),
  ...outputFamily(
    'aspnet-http-live-client-errors',
    3,
    [
      'Ask, for each request: does any endpoint match the path? Does one match the method? Can the body be read in its content type?',
    ],
    [
      {
        key: 'method-and-path',
        code: web({
          app: `app.MapGet("/orders", () => new[] { "o-1", "o-2" });`,
          client: `Console.WriteLine((int)(await http.PostAsync("/orders", null)).StatusCode);
Console.WriteLine((int)(await http.GetAsync("/order")).StatusCode);`,
        }),
        output: '405\n404',
        why: '`/orders` exists but only for `GET`, so a `POST` there is `405 Method Not Allowed`. `/order` (singular) matches no route at all, which is `404 Not Found`. Telling the two apart helps clients: 405 means "right resource, wrong method".',
      },
      {
        key: 'media-type',
        code: web({
          app: `app.MapPost("/orders", (NewOrder order) => order.Sku);`,
          client: `var asText = new StringContent("{\\"sku\\":\\"A1\\"}", Encoding.UTF8, "text/plain");
Console.WriteLine((int)(await http.PostAsync("/orders", asText)).StatusCode);
var broken = new StringContent("{\\"sku\\":", Encoding.UTF8, "application/json");
Console.WriteLine((int)(await http.PostAsync("/orders", broken)).StatusCode);`,
          types: 'record NewOrder(string Sku);',
        }),
        output: '415\n400',
        why: 'The body parameter is read as JSON, so a `text/plain` body is rejected with `415 Unsupported Media Type` before any parsing, even though the text happens to be JSON. A request that says `application/json` but is not valid JSON fails to bind: `400 Bad Request`.',
      },
    ],
  ),
  ...choiceFamily(
    'aspnet-http-resource-design',
    3,
    'Resources are nouns in the path; the HTTP method is the verb; filtering, sorting and paging go in the query string.',
    [
      {
        key: 'sub-resource',
        question:
          'Which endpoint best follows REST conventions for listing the orders of customer 42?',
        correct: '`GET /api/customers/42/orders`',
        wrong: [
          '`POST /api/getCustomerOrders` with `{ "customerId": 42 }`',
          '`GET /api/customers/42/getOrders`',
          '`GET /api/orders/list?action=byCustomer&id=42`',
        ],
        why: 'Orders belong to a customer, so they are modeled as a sub-resource and read with `GET`. The other options put verbs or actions in the URL (an RPC style): `POST` also makes a read look unsafe and uncacheable.',
      },
      {
        key: 'query',
        question:
          'Clients need the second page (20 per page) of fantasy books, newest first. Which request design fits REST conventions?',
        correct: '`GET /api/books?category=fantasy&sort=-publishedAt&page=2&pageSize=20`',
        wrong: [
          '`GET /api/books/fantasy/newest/2/20`',
          '`GET /api/books` with a JSON request body `{ "category": "fantasy", "page": 2 }`',
          '`GET /api/getBooks?category=fantasy&page=2`',
        ],
        why: 'Filters, sorting and paging refine one collection, so they belong in the query string, where they are optional and order-independent. Path segments imply a hierarchy of resources. A body on `GET` has no defined meaning, and many proxies and clients drop it. A verb in the path (`getBooks`) duplicates what the method already says.',
      },
      {
        key: 'partial-update',
        question:
          'A client changes only a customer’s phone number and sends just that field. Which request matches HTTP semantics?',
        correct: '`PATCH /api/customers/42` with `{ "phone": "+44 20 7946 0000" }`',
        wrong: [
          '`PUT /api/customers/42` with `{ "phone": "+44 20 7946 0000" }`',
          '`GET /api/customers/42?phone=+44 20 7946 0000`',
          '`DELETE` then `POST` the customer with the new phone number',
        ],
        why: '`PATCH` applies a partial modification. `PUT` replaces the whole representation, so a `PUT` carrying only the phone number would, by its semantics, clear every other field. A `GET` must not change anything, and delete-then-create loses the identity and history of the customer.',
      },
    ],
  ),
  ...choiceFamily(
    'aspnet-http-pagination',
    4,
    'Think about what the database does for an `OFFSET`, and what happens to offsets when rows are inserted between two page requests.',
    [
      {
        key: 'duplicates',
        question:
          'A client pages through the newest orders. Between its two requests, two new orders were created. What explains the result, and what fixes it?',
        code: plain(`GET /api/orders?sort=-id&page=1&pageSize=5
200 OK  ids: 50, 49, 48, 47, 46

(orders 51 and 52 are created)

GET /api/orders?sort=-id&page=2&pageSize=5
200 OK  ids: 47, 46, 45, 44, 43`),
        correct:
          'Offset paging counts from the front of a list that grew, so every row shifted back two places; use keyset (cursor) paging such as `?before=46` on the stable `id` order',
        wrong: [
          'The second response came from a stale cache; add `Cache-Control: no-store`',
          'The client and server disagree on whether page numbers start at 0 or 1',
          'Sorting by `id` is not stable; sort by creation time instead',
        ],
        why: 'Page 2 means "skip 5 rows". After two inserts at the front, the rows that were 6th and 7th (47 and 46) became the 6th and 7th again in the new list, so the client sees them twice. Keyset paging asks for "the 5 rows after the last one I saw" (`id < 46`), which is unaffected by inserts. A stale cache would have returned identical pages, and an off-by-one page number would skip or repeat a whole page, not two rows.',
      },
      {
        key: 'deep-offset',
        question: 'Why is the deep page so much slower than the first, and what is the usual fix?',
        code: plain(`GET /api/events?page=1&pageSize=50       5 ms
GET /api/events?page=50000&pageSize=50   4100 ms

SQL for the slow request:
SELECT ... FROM events ORDER BY id
OFFSET 2499950 ROWS FETCH NEXT 50 ROWS ONLY`),
        correct:
          'The database must walk past all 2,499,950 skipped rows before returning 50; keyset paging (`WHERE id > @lastSeenId ORDER BY id`) seeks straight to the start of the page',
        wrong: [
          'There is no index on `id`; add one and both pages will be equally fast',
          'Serializing the 50 rows to JSON is slower for rows near the end of the table',
          'The page size is too small; requesting 5,000 rows per page removes the problem',
        ],
        why: 'An `OFFSET` is not free: rows are read in order and thrown away until the offset is reached, so cost grows with the page number. The fast first page shows the ordering by `id` is already cheap, so a missing index is not the explanation. Keyset paging turns "skip N" into an index seek. Bigger pages only reduce the number of requests, not the cost of skipping.',
      },
      {
        key: 'unbounded',
        question:
          'A client sends `GET /api/products?page=1&pageSize=1000000` and the API’s memory use spikes until it restarts. What should the API do?',
        correct:
          'Enforce a maximum page size (for example 100) and a default, rejecting or capping larger values',
        wrong: [
          'Turn on response compression so the large response is smaller',
          'Change the endpoint to `POST` so the parameters are not in the URL',
          'Return `206 Partial Content` for responses larger than 1 MB',
        ],
        why: 'Paging only protects the server if the server controls the page size. Clamping to a maximum (or answering 400 with a clear message) bounds the work per request. Compression shrinks the bytes on the wire but the rows are still loaded and serialized. `206` belongs to byte-range requests, not to API pagination.',
      },
    ],
  ),
  ...outputFamily(
    'aspnet-http-problem-results',
    4,
    [
      'Problem details (RFC 9457) is a JSON body with `type`, `title`, `status` and optional `detail`, served as `application/problem+json`.',
    ],
    [
      {
        key: 'conflict',
        code: web({
          usings: ['System.Text.Json'],
          app: `app.MapPost("/orders", () => Results.Problem(
    title: "Out of stock",
    detail: "SKU A1 has 0 units left.",
    statusCode: StatusCodes.Status409Conflict));`,
          client: `var res = await http.PostAsync("/orders", null);
var body = JsonDocument.Parse(await res.Content.ReadAsStringAsync()).RootElement;
Console.WriteLine((int)res.StatusCode);
Console.WriteLine(res.Content.Headers.ContentType?.MediaType);
Console.WriteLine(body.GetProperty("title").GetString());
Console.WriteLine(body.GetProperty("status").GetInt32());`,
        }),
        output: '409\napplication/problem+json\nOut of stock\n409',
        why: '`Results.Problem` writes a problem details body with the given title, detail and status, and sets both the HTTP status and the `status` member to 409. The media type is `application/problem+json`, so clients can recognize an error body without knowing each endpoint’s format.',
      },
      {
        key: 'validation',
        code: web({
          usings: ['System.Text.Json'],
          app: `app.MapPost("/orders", () => Results.ValidationProblem(new Dictionary<string, string[]>
{
    ["quantity"] = ["Quantity must be at least 1."],
}));`,
          client: `var res = await http.PostAsync("/orders", null);
var body = JsonDocument.Parse(await res.Content.ReadAsStringAsync()).RootElement;
Console.WriteLine((int)res.StatusCode);
Console.WriteLine(body.GetProperty("title").GetString());
Console.WriteLine(body.GetProperty("errors").GetProperty("quantity")[0].GetString());`,
        }),
        output: '400\nOne or more validation errors occurred.\nQuantity must be at least 1.',
        why: '`Results.ValidationProblem` produces a validation problem: status 400 by default, the standard title "One or more validation errors occurred.", and an `errors` object mapping each field to its messages. Clients can show each message next to the right field.',
      },
    ],
  ),
  ...choiceFamily(
    'aspnet-http-conditional-requests',
    5,
    'An ETag identifies one version of a representation; `If-Match` and `If-None-Match` make a request conditional on it.',
    [
      {
        key: 'if-match',
        question:
          'Two editors load the same product. Editor B saves first. What does HTTP specify as the response to editor A’s save?',
        code: plain(`GET /api/products/7            -> 200 OK, ETag: "v7"   (both editors)
PUT /api/products/7  (editor B, If-Match: "v7")  -> 200 OK, ETag: "v8"

PUT /api/products/7 HTTP/1.1     (editor A)
If-Match: "v7"
Content-Type: application/json

{ "name": "Desk lamp", "price": 39.00 }`),
        correct:
          '`412 Precondition Failed`: the current ETag is `"v8"`, so the condition `If-Match: "v7"` is false and the update is not applied',
        wrong: [
          '`200 OK`: the last write wins',
          '`304 Not Modified`',
          '`428 Precondition Required`',
        ],
        why: '`If-Match` turns the `PUT` into "update only if the resource is still version v7". It is now v8, so the server refuses with `412` and editor A must reload and merge, which prevents a lost update. Last-write-wins is what happens without the header. `304` answers conditional reads, and `428` means the server requires a precondition that the client did not send at all.',
      },
      {
        key: 'if-none-match',
        question:
          'The product has not changed since the client cached it. What is the right response?',
        code: plain(`GET /api/products/7 HTTP/1.1
If-None-Match: "v8"

(current ETag of product 7 is "v8")`),
        correct: '`304 Not Modified` with no body; the client keeps using its cached copy',
        wrong: [
          '`200 OK` with the full product, as for any successful `GET`',
          '`412 Precondition Failed`',
          '`204 No Content`',
        ],
        why: '`If-None-Match` on a `GET` means "send it only if it changed". The ETag still matches, so `304 Not Modified` saves the body transfer. `412` is used when a precondition fails on a state-changing request; `204` would wrongly tell the client the product has no content.',
      },
    ],
  ),
  ...choiceFamily(
    'aspnet-http-idempotency-key',
    5,
    'The server needs to recognize that a second request is a retry of the first.',
    [
      {
        key: 'double-charge',
        question: 'A customer was charged twice. What is the robust fix?',
        code: plain(`10:02:11.204  POST /api/payments  amount=50.00  -> charged, response lost (client timeout)
10:02:16.311  POST /api/payments  amount=50.00  -> charged
                                     client retry after 5 s`),
        correct:
          'The client sends an `Idempotency-Key` header with a unique value per payment; the server stores the key with the outcome and returns the stored outcome for a repeat instead of charging again',
        wrong: [
          'Return `202 Accepted` instead of `201 Created` so clients do not retry',
          'Raise the client timeout so the response is never lost',
          'Make the client wait longer before retrying',
        ],
        why: 'A `POST` is not idempotent, and a client cannot tell "the request never arrived" from "the response was lost", so it must be able to retry. An idempotency key lets the server deduplicate retries. Longer timeouts or delays make the race rarer but never remove it, and the status code does not change client retry logic.',
      },
      {
        key: 'key-reuse',
        question:
          'The API supports `Idempotency-Key`. A request arrives with a key already used for a stored, completed payment of 50.00, but this request asks for 80.00. What should the server do?',
        correct:
          'Reject the request with an error: the key was already used with a different payload',
        wrong: [
          'Replay the stored 50.00 result as if it were a retry',
          'Process the 80.00 payment and overwrite the stored result',
          'Process the 80.00 payment as a new payment under the same key',
        ],
        why: 'A key identifies one operation. Replaying 50.00 hides a client bug and reports the wrong amount; charging 80.00 under a used key breaks the guarantee that retries are deduplicated. The safe behavior is to compare the payload and refuse a mismatch so the client fixes its key generation.',
      },
    ],
  ),
];

// ================================================================ Minimal APIs and routing

const productsApi = `using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;

var app = WebApplication.CreateSlimBuilder().Build();
app.MapGet("/products", () => "list");
app.MapPost("/products", (Product p) => Results.Created($"/products/{p.Id}", p));
app.MapPut("/products/{id:int}", (int id, Product p) => Results.NoContent());
app.MapDelete("/products/{id:int}", (int id) => Results.NoContent());

record Product(int Id, string Name);
`;

export const minimalApiRoutingFamilies: readonly QuestionSource[] = [
  ...choiceFamily(
    'aspnet-route-map-methods',
    1,
    'An endpoint matches on both the route template and the HTTP method.',
    [
      {
        key: 'put',
        question: 'Which request reaches the handler that takes both an `id` and a `Product`?',
        code: cs(productsApi),
        correct: '`PUT /products/7` with a JSON product in the body',
        wrong: [
          '`POST /products/7` with a JSON product in the body',
          '`GET /products?id=7`',
          '`PATCH /products` with a JSON product in the body',
        ],
        why: '`MapPut("/products/{id:int}", ...)` handles `PUT` requests whose path matches the template; `id` comes from the route and the `Product` from the JSON body. No endpoint maps `POST` or `PATCH` to those paths, and `/products?id=7` is the collection route.',
      },
      {
        key: 'not-allowed',
        question: 'Which request gets `405 Method Not Allowed` from this app?',
        code: cs(productsApi),
        correct: '`PATCH /products/7`',
        wrong: ['`DELETE /products/7`', '`GET /products`', '`POST /products` with a JSON product'],
        why: 'The path `/products/7` matches the `PUT` and `DELETE` endpoints, but none of them accepts `PATCH`, so routing answers 405 (the path is right, the method is not). The other three requests each have a matching endpoint.',
      },
    ],
  ),
  ...outputFamily(
    'aspnet-route-constraints',
    2,
    [
      'A route constraint that does not match makes the route not match at all; there is no binding error.',
    ],
    [
      {
        key: 'int',
        code: web({
          app: `app.MapGet("/orders/{id:int}", (int id) => $"order {id}");`,
          client: `foreach (var path in new[] { "/orders/7", "/orders/abc", "/orders/7.5" })
    Console.WriteLine((int)(await http.GetAsync(path)).StatusCode);`,
        }),
        output: '200\n404\n404',
        why: '`{id:int}` only matches segments that parse as an integer. `abc` and `7.5` do not, so no endpoint matches and the result is 404, not a 400 binding error. Constraints are for telling routes apart, not for validating input.',
      },
      {
        key: 'min',
        code: web({
          app: `app.MapGet("/items/{id:int:min(1)}", (int id) => $"item {id}");`,
          client: `foreach (var path in new[] { "/items/0", "/items/3", "/items/-1" })
{
    var res = await http.GetAsync(path);
    Console.WriteLine($"{(int)res.StatusCode} {await res.Content.ReadAsStringAsync()}");
}`,
        }),
        output: '404\n200 item 3\n404',
        why: 'Constraints combine: `int:min(1)` needs an integer of at least 1. `0` and `-1` are integers but below the minimum, so the route does not match (404 with an empty body). Only `/items/3` reaches the handler.',
      },
      {
        key: 'optional',
        code: web({
          app: `app.MapGet("/reports/{year:int?}", (int? year) => year?.ToString() ?? "all years");`,
          client: `Console.WriteLine(await http.GetStringAsync("/reports"));
Console.WriteLine(await http.GetStringAsync("/reports/2025"));`,
        }),
        output: 'all years\n2025',
        why: 'A `?` after the constraint makes the parameter optional: `/reports` matches with `year` null, and `/reports/2025` binds `2025`. The handler parameter must be nullable (`int?`) to represent the missing value.',
      },
    ],
  ),
  ...outputFamily(
    'aspnet-route-binding-sources',
    2,
    [
      'A simple-type parameter that is not in the route template is bound from the query string; non-nullable means required.',
    ],
    [
      {
        key: 'required-query',
        code: web({
          app: `app.MapGet("/products", (int page) => $"page {page}");`,
          client: `foreach (var path in new[] { "/products", "/products?page=2", "/products?page=two" })
    Console.WriteLine((int)(await http.GetAsync(path)).StatusCode);`,
        }),
        output: '400\n200\n400',
        why: '`page` is not in the route, so it comes from the query string, and because it is a non-nullable `int` it is required. Missing (`/products`) or unparsable (`page=two`) values fail binding with `400 Bad Request`; the route itself matched, so it is not a 404.',
      },
      {
        key: 'nullable-query',
        code: web({
          app: `app.MapGet("/items", (int? page, string? sort) => $"{page ?? 1}:{sort ?? "none"}");`,
          client: `Console.WriteLine(await http.GetStringAsync("/items?sort=price"));
Console.WriteLine(await http.GetStringAsync("/items?page=3"));`,
        }),
        output: '1:price\n3:none',
        why: 'Nullable parameters are optional: a missing query value binds as `null`, so the handler’s defaults apply. `page` is read from `?page=3` and `sort` from `?sort=price`.',
      },
      {
        key: 'route-and-query',
        code: web({
          app: `app.MapGet("/customers/{id:int}/orders", (int id, string? status) =>
    $"customer {id}, status {status ?? "any"}");`,
          client: `Console.WriteLine(await http.GetStringAsync("/customers/42/orders?status=open"));
Console.WriteLine(await http.GetStringAsync("/customers/42/orders"));`,
        }),
        output: 'customer 42, status open\ncustomer 42, status any',
        why: '`id` appears in the route template, so it is bound from the path; `status` does not, so it comes from the query string and is optional because it is nullable.',
      },
    ],
  ),
  ...outputFamily(
    'aspnet-route-groups',
    3,
    ['A route group adds its prefix (and its filters or metadata) to every endpoint mapped on it.'],
    [
      {
        key: 'prefix',
        code: web({
          app: `var api = app.MapGroup("/api/v1");
api.MapGet("/products", () => "list");
api.MapGet("/products/{id:guid}", (Guid id) => "one");`,
          client: `foreach (var path in new[] { "/api/v1/products", "/products", "/api/v1/products/5" })
    Console.WriteLine($"{path} {(int)(await http.GetAsync(path)).StatusCode}");`,
        }),
        output: '/api/v1/products 200\n/products 404\n/api/v1/products/5 404',
        why: 'Endpoints on the group live under `/api/v1`, so `/products` alone matches nothing. `/api/v1/products/5` fails the `guid` constraint, so that route does not match either: 404.',
      },
      {
        key: 'nested',
        code: web({
          app: `var api = app.MapGroup("/api");
var v2 = api.MapGroup("/v2");
v2.MapGet("/ping", () => "pong");`,
          client: `foreach (var path in new[] { "/api/v2/ping", "/v2/ping", "/api/ping" })
    Console.WriteLine($"{path} {(int)(await http.GetAsync(path)).StatusCode}");`,
        }),
        output: '/api/v2/ping 200\n/v2/ping 404\n/api/ping 404',
        why: 'Nested groups concatenate their prefixes, so the only route is `/api/v2/ping`. Neither prefix alone is enough.',
      },
      {
        key: 'filter',
        code: web({
          app: `var api = app.MapGroup("/api");
api.AddEndpointFilter(async (context, next) =>
{
    Console.WriteLine("filter");
    return await next(context);
});
api.MapGet("/a", () => { Console.WriteLine("handler a"); return "a"; });
app.MapGet("/health", () => { Console.WriteLine("handler health"); return "ok"; });`,
          client: `await http.GetAsync("/api/a");
await http.GetAsync("/health");`,
        }),
        output: 'filter\nhandler a\nhandler health',
        why: 'An endpoint filter added to a group runs around every endpoint in that group, before the handler. `/health` is mapped on `app`, not on the group, so it runs without the filter.',
      },
    ],
  ),
  ...csCompilesFamily(
    'aspnet-typed-results-compile',
    3,
    'What is the type of the conditional expression `c ? a : b` when `a` and `b` have different types?',
    [
      {
        key: 'ternary-typed',
        code: `using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;

var app = WebApplication.CreateSlimBuilder().Build();
app.MapGet("/orders/{id:int}", (int id) =>
    id == 1 ? TypedResults.Ok(new Order(1)) : TypedResults.NotFound());

record Order(int Id);`,
        compiles: false,
        why: '`TypedResults.Ok(...)` returns `Ok<Order>` and `TypedResults.NotFound()` returns `NotFound`: two unrelated types, so the conditional has no natural type and the lambda has no return type the compiler can infer. Declare the return type as `Results<Ok<Order>, NotFound>`, or use `Results.Ok`/`Results.NotFound`, which both return `IResult`.',
      },
      {
        key: 'results-union',
        code: `using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.HttpResults;

var app = WebApplication.CreateSlimBuilder().Build();
app.MapGet("/orders/{id:int}", Results<Ok<Order>, NotFound> (int id) =>
    id == 1 ? TypedResults.Ok(new Order(1)) : TypedResults.NotFound());

record Order(int Id);`,
        compiles: true,
        why: 'The lambda declares its return type `Results<Ok<Order>, NotFound>`, which has implicit conversions from both `Ok<Order>` and `NotFound`, so the conditional is target-typed and compiles. The union type also documents both possible responses for OpenAPI.',
      },
      {
        key: 'results-iresult',
        code: `using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;

var app = WebApplication.CreateSlimBuilder().Build();
app.MapGet("/orders/{id:int}", (int id) =>
    id == 1 ? Results.Ok(new Order(1)) : Results.NotFound());

record Order(int Id);`,
        compiles: true,
        why: 'Every `Results.*` factory returns the interface `IResult`, so both branches have the same type and the lambda returns `IResult`. It compiles, but the specific response types are erased, unlike with `TypedResults` and `Results<...>`.',
      },
    ],
  ),
  ...outputFamily(
    'aspnet-route-precedence',
    4,
    [
      'Routing does not use registration order: it ranks matching templates by how specific each segment is, and fails if two are equally specific.',
    ],
    [
      {
        key: 'literal-wins',
        code: web({
          app: `app.MapGet("/users/{id}", (string id) => $"user {id}");
app.MapGet("/users/me", () => "current user");`,
          client: `Console.WriteLine(await http.GetStringAsync("/users/me"));
Console.WriteLine(await http.GetStringAsync("/users/5"));`,
        }),
        output: 'current user\nuser 5',
        why: 'Both templates match `/users/me`, but a literal segment is more specific than a parameter, so `/users/me` wins even though it was registered second. Endpoint routing ranks by precedence, not by the order of `Map` calls.',
      },
      {
        key: 'constraint',
        code: web({
          app: `app.MapGet("/users/{name}", (string name) => "by name");
app.MapGet("/users/{id:int}", (int id) => "by id");`,
          client: `Console.WriteLine(await http.GetStringAsync("/users/5"));
Console.WriteLine(await http.GetStringAsync("/users/bob"));`,
        }),
        output: 'by id\nby name',
        why: 'For `/users/5` both templates match, and a constrained parameter ranks above an unconstrained one, so the `int` route wins. `bob` fails the `int` constraint, leaving only the `{name}` route.',
      },
      {
        key: 'ambiguous',
        code: web({
          app: `app.MapGet("/users/{id}", (string id) => "by id");
app.MapGet("/users/{name}", (string name) => "by name");`,
          client: `Console.WriteLine((int)(await http.GetAsync("/users/5")).StatusCode);`,
        }),
        output: '500',
        why: 'Parameter names do not distinguish routes: both templates are "users / any segment" with equal precedence, so routing throws an ambiguous-match exception at request time and the request fails with 500. Use different paths or a constraint to tell them apart.',
      },
    ],
  ),
  ...outputFamily(
    'aspnet-binding-inference',
    4,
    [
      'Minimal APIs infer each parameter’s source: route, query, registered service, or (for one complex type) the JSON body.',
    ],
    [
      {
        key: 'get-complex',
        code: web({
          app: `app.MapGet("/health", () => "ok");
app.MapGet("/search", (Filter filter) => $"searching {filter.Q}");`,
          client: `Console.WriteLine((int)(await http.GetAsync("/search?q=lamp")).StatusCode);`,
          types: 'record Filter(string Q);',
        }),
        output: '500',
        why: 'A complex-type parameter is inferred to come from the JSON body, and a body is not allowed to be inferred for `GET`, so building the endpoint fails and the request ends in 500. The query string is not mapped onto a record automatically: use `[AsParameters] Filter filter` or a `string q` parameter.',
      },
      {
        key: 'as-parameters',
        code: web({
          app: `app.MapGet("/search", ([AsParameters] Filter filter) => $"searching {filter.Q}, page {filter.Page}");`,
          client: `Console.WriteLine(await http.GetStringAsync("/search?q=lamp&page=2"));`,
          types: 'record Filter(string Q, int Page);',
        }),
        output: 'searching lamp, page 2',
        why: '`[AsParameters]` binds each constructor parameter of `Filter` as if it were a handler parameter, so `Q` and `Page` come from the query string (names match case-insensitively).',
      },
      {
        key: 'service',
        code: web({
          usings: ['System.Net.Http.Json'],
          services: 'builder.Services.AddSingleton<Clock>();',
          app: `app.MapPost("/orders", (NewOrder order, Clock clock) => $"{order.Sku} at {clock.Today:yyyy-MM-dd}");`,
          client: `var res = await http.PostAsJsonAsync("/orders", new { sku = "A1" });
Console.WriteLine(await res.Content.ReadAsStringAsync());`,
          types: `record NewOrder(string Sku);
class Clock { public DateOnly Today => new(2025, 1, 31); }`,
        }),
        output: 'A1 at 2025-01-31',
        why: '`Clock` is registered in the container, so the parameter is resolved from dependency injection, and `NewOrder` is the single complex parameter left, so it comes from the JSON body. No attributes are needed in either case.',
      },
    ],
  ),
  ...outputFamily(
    'aspnet-controllers-vs-minimal',
    5,
    [
      '`[ApiController]` adds automatic model validation for controllers. Is anything doing that for the minimal API endpoint?',
    ],
    [
      {
        key: 'same-dto',
        code: web({
          full: true,
          usings: [
            'System.ComponentModel.DataAnnotations',
            'System.Net.Http.Json',
            'Microsoft.AspNetCore.Mvc',
          ],
          services: `// The program is compiled in memory, so its controllers are registered explicitly.
builder.Services.AddControllers().AddApplicationPart(typeof(OrdersController).Assembly);`,
          app: `app.MapControllers();
app.MapPost("/minimal/orders", (NewOrder order) => Results.Ok(order));`,
          client: `foreach (var path in new[] { "/api/orders", "/minimal/orders" })
    Console.WriteLine((int)(await http.PostAsJsonAsync(path, new { sku = "A1", quantity = 0 })).StatusCode);`,
          types: `[ApiController]
[Route("api/orders")]
public class OrdersController : ControllerBase
{
    [HttpPost]
    public IActionResult Create(NewOrder order) => Ok(order);
}

public class NewOrder
{
    [Required] public string? Sku { get; set; }
    [Range(1, 100)] public int Quantity { get; set; }
}`,
        }),
        output: '400\n200',
        why: 'With `[ApiController]`, an invalid model never reaches the action: the framework answers 400 with a validation problem. The minimal API endpoint binds the same DTO but nothing in this program turns on validation for minimal APIs, so `[Range]` is ignored and quantity 0 is accepted. Attributes on a DTO are only metadata until something runs a validator.',
      },
      {
        key: 'no-api-controller',
        code: web({
          full: true,
          usings: [
            'System.ComponentModel.DataAnnotations',
            'System.Net.Http.Json',
            'Microsoft.AspNetCore.Mvc',
          ],
          services: `// The program is compiled in memory, so its controllers are registered explicitly.
builder.Services.AddControllers().AddApplicationPart(typeof(OrdersController).Assembly);`,
          app: `app.MapControllers();`,
          client: `var res = await http.PostAsJsonAsync("/api/orders", new { sku = "A1", quantity = 0 });
Console.WriteLine($"{(int)res.StatusCode} {await res.Content.ReadAsStringAsync()}");`,
          types: `[Route("api/orders")]
public class OrdersController : ControllerBase
{
    [HttpPost]
    public IActionResult Create([FromBody] NewOrder order) =>
        Ok(ModelState.IsValid ? "saved" : "invalid but saved anyway");
}

public class NewOrder
{
    [Required] public string? Sku { get; set; }
    [Range(1, 100)] public int Quantity { get; set; }
}`,
        }),
        output: '200 invalid but saved anyway',
        why: 'MVC still validates the model and records the errors in `ModelState`, but without `[ApiController]` it does not stop the request: the action runs and must check `ModelState.IsValid` itself. This action ignores the result, so invalid data would be processed. `[ApiController]` turns the check into an automatic 400.',
      },
    ],
  ),
  ...outputFamily(
    'aspnet-route-name-mismatch',
    5,
    [
      'Binding matches handler parameters to route values by name. What happens to a parameter whose name is not in the template?',
    ],
    [
      {
        key: 'renamed',
        code: web({
          app: `app.MapGet("/orders/{orderId}", (int id) => $"order {id}");`,
          client: `Console.WriteLine((int)(await http.GetAsync("/orders/5")).StatusCode);
Console.WriteLine(await http.GetStringAsync("/orders/5?id=9"));`,
        }),
        output: '400\norder 9',
        why: 'The template names the segment `orderId`, but the parameter is `id`. Since no route value is called `id`, it is bound from the query string instead, and as a non-nullable `int` it is required: `/orders/5` fails with 400, and `?id=9` is silently used while the `5` in the path is ignored. Keep template and parameter names identical (or use `[FromRoute(Name = "orderId")]`).',
      },
      {
        key: 'nullable-renamed',
        code: web({
          app: `app.MapGet("/orders/{orderId}", (int? id) => id is null ? "no id" : $"order {id}");`,
          client: `Console.WriteLine(await http.GetStringAsync("/orders/5"));`,
        }),
        output: 'no id',
        why: 'Because the parameter is called `id`, not `orderId`, it is not bound from the route at all; it is an optional query-string parameter, and there is no `?id=` in the URL. The request "succeeds" while ignoring the id in the path, which is worse than a 400 because nothing signals the bug.',
      },
    ],
  ),
];
