import type { QuestionSource } from '@pracstack/content-model';
import { json, plain, ts } from '../helpers';
import { scenarioFamily } from './builders';

/*
 * Serverless APIs and data: API Gateway HTTP and REST APIs, authorizers,
 * throttling and CORS; DynamoDB key design, Query versus Scan, secondary
 * indexes, conditional writes and TTL; S3 access, presigned URLs and Block
 * Public Access.
 */

const singleTable = `PK            SK                          Attributes
CUSTOMER#42   PROFILE                     name=Ana, email=ana@example.com
CUSTOMER#42   ADDRESS#home                city=Porto
CUSTOMER#42   ORDER#2026-10-28#8812       total=40.00
CUSTOMER#42   ORDER#2026-11-01#9001       total=129.90
CUSTOMER#42   ORDER#2026-11-15#9002       total=18.50
CUSTOMER#77   ORDER#2026-11-03#9010       total=63.00`;

export const apiDataFamilies: readonly QuestionSource[] = [
  ...scenarioFamily(
    'aws-apigw-choose',
    2,
    'Match the requirement to the feature set: HTTP APIs are simpler and cheaper; REST APIs have more features.',
    [
      {
        key: 'function-url',
        difficulty: 1,
        question:
          'A single Lambda function receives webhooks from a payment provider and verifies the provider’s signature itself. It needs nothing but an HTTPS endpoint: no routing, throttling plans or authorizers. What is the simplest option?',
        correct: 'A Lambda function URL, which gives the function its own HTTPS endpoint',
        wrong: [
          'An Amazon EventBridge rule, which accepts HTTP requests from the internet',
          'An SQS queue, which the provider can post webhooks to without authentication',
          'An S3 bucket with static website hosting that forwards requests to Lambda',
        ],
        why: 'A function URL is a built-in HTTPS endpoint for one function, with either IAM auth or none (the function then authenticates the caller, as with a signed webhook). API Gateway adds routing, authorizers, throttling and more when you need them. EventBridge rules match events already on a bus; they are not public HTTP endpoints. An S3 website serves files and cannot invoke code.',
      },
      {
        key: 'usage-plans',
        question:
          'A partner API must give each partner an API key with its own request quota and rate limit. Which API Gateway option supports that directly?',
        correct: 'A REST API, using API keys and usage plans',
        wrong: [
          'An HTTP API, using API keys and usage plans',
          'An HTTP API with a JWT authorizer, which enforces per-partner quotas',
          'Either type: quotas are configured on the Lambda function',
        ],
        why: 'Usage plans with API keys (per-client throttling and quotas) are a REST API feature; HTTP APIs do not have them. A JWT authorizer authenticates callers but does not meter them. Lambda has no notion of per-client quotas.',
      },
      {
        key: 'jwt-http-api',
        question:
          'A new internal API proxies to Lambda functions and must accept access tokens (JWTs) from the company’s OpenID Connect identity provider. It needs no usage plans, request validation or caching. Which option fits best?',
        correct:
          'An HTTP API with a JWT authorizer configured with the provider’s issuer and audience',
        wrong: [
          'A REST API, because only REST APIs can validate JWTs',
          'An HTTP API with no authorizer; each function decodes the token without checking the signature',
          'A REST API with API keys handed out to every employee instead of tokens',
        ],
        why: 'HTTP APIs are the lighter, lower-latency choice for Lambda proxies and have a built-in JWT authorizer that checks signature, issuer, audience and expiry. Decoding a token without verifying its signature lets anyone forge one. API keys identify clients for metering; they are not a user authentication mechanism.',
      },
    ],
  ),
  ...scenarioFamily(
    'aws-apigw-errors',
    3,
    'Who produced the error: the browser, API Gateway, the authorizer or the integration?',
    [
      {
        key: 'cors-preflight',
        question:
          'A single-page app at `https://shop.example.com` calls an API Gateway HTTP API. `curl` calls work, but the browser shows the error below. What is the fix?',
        code: plain(`Access to fetch at 'https://abc123.execute-api.eu-west-1.amazonaws.com/orders'
from origin 'https://shop.example.com' has been blocked by CORS policy:
Response to preflight request doesn't pass access control check:
No 'Access-Control-Allow-Origin' header is present on the requested resource.`),
        correct:
          'Configure CORS on the API: allow origin `https://shop.example.com` and the methods and headers the app sends (such as `Authorization` and `Content-Type`)',
        wrong: [
          'Give the browser an IAM role so it is allowed to call API Gateway',
          'Nothing: curl works, so the API is fine and the browser is misconfigured',
          'Change the API to return HTTP 200 for every request, including errors',
        ],
        why: 'CORS is enforced by browsers: before a cross-origin request with custom headers, the browser sends an OPTIONS preflight and requires `Access-Control-Allow-*` headers in the reply. curl does not do CORS, which is why it works. HTTP APIs have a CORS configuration that answers preflights for you; with REST APIs or custom setups, the responses (including the Lambda response) must include the headers.',
      },
      {
        key: 'throttled-429',
        question:
          'During a load test, clients start receiving the response below from API Gateway, and the function’s logs show no errors. What is happening, and what should clients do?',
        code: plain(`HTTP/1.1 429 Too Many Requests
Content-Type: application/json

{"message":"Too Many Requests"}`),
        correct:
          'API Gateway is throttling requests above the configured rate or burst limit; clients should retry with exponential backoff and jitter (and raise the limits if the load is legitimate)',
        wrong: [
          'The Lambda function returned 429 because its memory is too low',
          'The JWT has expired; clients should sign in again',
          'DynamoDB rejected the writes; the table needs a new index',
        ],
        why: 'A 429 with this body comes from API Gateway’s throttling (stage, route or account limits) before the integration is called, which is why the function logs are clean. Clients should back off and retry; immediate retries make throttling worse. An expired token would produce 401, not 429.',
      },
      {
        key: 'jwt-audience',
        difficulty: 4,
        question:
          'An HTTP API JWT authorizer is configured as below. A request carries a valid, unexpired token from the right issuer whose decoded payload is shown. API Gateway responds 401 Unauthorized. Why?',
        code: plain(`Authorizer configuration
  Issuer:   https://login.example.com/
  Audience: orders-api

Token payload
  {
    "iss": "https://login.example.com/",
    "aud": "web-client",
    "sub": "user-1842",
    "exp": 1895000000
  }`),
        correct:
          'The token’s `aud` (`web-client`) is not in the authorizer’s audience list, so the token is rejected',
        wrong: [
          'JWT authorizers require the `sub` claim to be an email address',
          'The issuer URL must not end with a slash',
          'The function’s execution role does not allow the user `user-1842`',
        ],
        why: 'The authorizer checks the signature, issuer, expiry and that the audience (or client id) matches one of its configured audiences. A token issued for a different client or API is refused even though it is genuine. Usually the client should request a token for the `orders-api` audience rather than widening the authorizer.',
      },
      {
        key: 'malformed-proxy',
        difficulty: 4,
        question:
          'A REST API with Lambda proxy integration returns `502 {"message": "Internal server error"}`. The execution log says “Execution failed due to configuration error: Malformed Lambda proxy response”. The handler is below. What is wrong?',
        code: ts(`export const handler = async (event: { pathParameters: { id: string } }) => {
  const order = await loadOrder(event.pathParameters.id);
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: order,
  };
};`),
        correct: '`body` must be a string; return `body: JSON.stringify(order)`',
        wrong: [
          '`statusCode` must be the string `"200"`',
          'Proxy integrations do not allow the function to set headers',
          'The function must return a Promise of a string, not an object',
        ],
        why: 'With proxy integration the function’s return value is the HTTP response description, and `body` has to be a string (Base64 with `isBase64Encoded` for binary). An object body is malformed, which API Gateway reports to the client as a 502. The error is in the response shape, not in the business logic, which is why the function itself logs no exception.',
      },
    ],
  ),
  ...scenarioFamily(
    'aws-dynamodb-keys',
    3,
    'Start from the access pattern: which key values do you know at query time, and in what order do you want results?',
    [
      {
        key: 'customer-orders',
        difficulty: 2,
        question:
          'The main access pattern of an orders table is “show a customer’s orders, newest first, 20 at a time”. Which key design fits?',
        correct:
          'Partition key `customerId`, sort key `orderDate#orderId`; Query by customer with descending sort order and a limit',
        wrong: [
          'Partition key `orderId` only; Scan the table filtered by customer and sort the results in code',
          'Partition key `orderDate`, sort key `customerId`; Query each day separately',
          'Partition key `status`, sort key `customerId`; Query each status and merge',
        ],
        why: 'DynamoDB design starts from access patterns. Putting a customer’s orders in one partition, sorted by date, makes the page a single Query (`ScanIndexForward=false`, `Limit=20`). A Scan reads the whole table; partitioning by date or status spreads one customer across many partitions and needs many queries.',
      },
      {
        key: 'scan-with-filter',
        difficulty: 2,
        question:
          'This code gets slower and more expensive as the table grows, although each customer has only a few orders. Why?',
        code: ts(`const result = await client.send(
  new ScanCommand({
    TableName: 'Orders',
    FilterExpression: 'customerId = :c',
    ExpressionAttributeValues: { ':c': { S: customerId } },
  }),
);`),
        correct:
          'A Scan reads every item in the table and the filter is applied afterwards, so read cost grows with the table, not with the result',
        wrong: [
          'FilterExpression builds a temporary index on every call',
          'Scans are slow only because the client does not cache the results',
          'The filter is applied before reading, but Scan results are sorted, which is slow',
        ],
        why: 'Filter expressions reduce what is returned, not what is read: capacity is consumed for every item scanned. Queries read only the items under one partition key value. If customers are a key access pattern, `customerId` belongs in the table key or a global secondary index.',
      },
      {
        key: 'new-lookup-gsi',
        question:
          'A table has partition key `customerId` and sort key `orderId`. A new feature must load an order by `orderId` alone (the customer is not known). The table is in production. What fits?',
        correct: 'Add a global secondary index with partition key `orderId` and Query the index',
        wrong: [
          'Add a local secondary index on `orderId` to the existing table',
          'Change the table’s partition key to `orderId` in place',
          'Scan the table with a filter on `orderId`',
        ],
        why: 'Global secondary indexes can be added to an existing table and can have a completely different partition key. Local secondary indexes share the table’s partition key and can only be created with the table, and key schemas cannot be changed in place. A Scan per lookup reads the whole table.',
      },
      {
        key: 'begins-with',
        difficulty: 4,
        question:
          'A single-table design stores items like those below. Which key condition returns only customer 42’s orders from November 2026?',
        code: plain(singleTable),
        correct: "`PK = 'CUSTOMER#42' AND begins_with(SK, 'ORDER#2026-11')`",
        wrong: [
          "`PK = 'CUSTOMER#42' AND begins_with(SK, 'ORDER#')`",
          "`begins_with(SK, 'ORDER#2026-11')` without a partition key condition",
          "`PK = 'CUSTOMER#42' AND contains(SK, '2026-11')`",
        ],
        why: 'A Query needs an equality condition on the partition key and may narrow the sort key with `=`, `<`, `<=`, `>`, `>=`, `BETWEEN` or `begins_with`. Putting the type and date at the start of the sort key makes “orders in a month” a prefix. `ORDER#` alone returns all of the customer’s orders; `contains` is not allowed in a key condition (only in filters), and a Query cannot omit the partition key.',
      },
      {
        key: 'hot-partition',
        difficulty: 5,
        question:
          'An orders table has a global secondary index with partition key `status` (values PENDING, SHIPPED, DELIVERED) so the warehouse can list pending orders. At peak, writes to the table are throttled with the error below even though table capacity is far from used. What is the cause and a fix?',
        code: plain(`ProvisionedThroughputExceededException: The level of configured provisioned
throughput for one or more global secondary indexes of the table was exceeded.`),
        correct:
          'The index key has only three values, so nearly all index writes hit a few partitions; use a higher-cardinality key such as `warehouseId#status` or shard it (`PENDING#0` to `PENDING#9`)',
        wrong: [
          'GSIs are read-only copies, so writing to the table cannot be throttled by them',
          'The table needs a local secondary index on `status` instead, which has unlimited throughput',
          'Increase the item size so fewer items are written',
        ],
        why: 'Every table write that changes an indexed attribute is also a write to the index. When the index partition key has very few values, that traffic concentrates on a few partitions (a hot partition), and index throttling pushes back on table writes. Spreading the key over many values fixes the distribution; the queries then read several shards or include the warehouse.',
      },
    ],
  ),
  ...scenarioFamily(
    'aws-dynamodb-conditions',
    4,
    'A condition expression is checked atomically with the write. What happens to the second writer?',
    [
      {
        key: 'unique-email',
        question:
          'Sign-up stores a user item with `PK = EMAIL#<address>` using PutItem. Two sign-ups with the same email at the same moment both succeed, and one overwrites the other. What is the fix?',
        correct:
          "Add `ConditionExpression: 'attribute_not_exists(PK)'` to the PutItem; the second write fails with ConditionalCheckFailedException, which the API turns into 409 Conflict",
        wrong: [
          'Call GetItem first and only call PutItem if nothing was found',
          'Use a Scan before writing to check every user’s email',
          'Enable DynamoDB Streams so duplicates are removed afterwards',
        ],
        why: 'PutItem replaces an existing item with the same key unless a condition says otherwise. The condition is evaluated atomically with the write, so only one of two concurrent requests can win. Read-then-write has a race window between the two calls (both reads see nothing). Cleaning up afterwards means one user’s data was already lost.',
      },
      {
        key: 'optimistic-lock',
        difficulty: 5,
        question:
          'Two editors load the same product (version 7) and each saves with the update below. The first save succeeds. What happens to the second?',
        code: ts(`await client.send(
  new UpdateItemCommand({
    TableName: 'Products',
    Key: { pk: { S: 'PRODUCT#311' } },
    UpdateExpression: 'SET price = :price, version = version + :one',
    ConditionExpression: 'version = :expected',
    ExpressionAttributeValues: {
      ':price': { N: newPrice },
      ':one': { N: '1' },
      ':expected': { N: '7' },
    },
  }),
);`),
        correct:
          'It fails with ConditionalCheckFailedException because the version is now 8; the app should reload the product and let the editor retry or merge',
        wrong: [
          'It succeeds and overwrites the first editor’s price (last writer wins)',
          'DynamoDB queues it until the first transaction commits, then applies it to version 8',
          'It succeeds but sets version to 8 again, so both edits are kept',
        ],
        why: 'This is optimistic locking: each write states the version it was based on, and the condition makes a stale write fail instead of silently overwriting someone else’s change. Without the condition, the last writer would win. DynamoDB does not queue or merge writes; the application decides what to do on conflict.',
      },
      {
        key: 'ttl-attribute-type',
        difficulty: 3,
        question:
          'TTL is enabled on a sessions table with attribute `expiresAt`. Weeks later, no session has ever been deleted. Items look like the one below. Why?',
        code: json(`{
  "pk": { "S": "SESSION#7f3a" },
  "userId": { "S": "user-1842" },
  "expiresAt": { "S": "2026-11-23T10:00:00Z" }
}`),
        correct:
          'The TTL attribute must be a Number holding a Unix epoch time in seconds; items whose attribute is a string are never expired',
        wrong: [
          'TTL only deletes items once the table has been idle for a week',
          'The timestamp must be in the local time zone of the table’s Region',
          'TTL requires a global secondary index on `expiresAt`',
        ],
        why: 'DynamoDB TTL ignores items whose TTL attribute is not a Number containing epoch seconds. The fix is to store, for example, `"expiresAt": { "N": "1795428000" }`. No index is needed: TTL scans for expired items in the background.',
      },
      {
        key: 'ttl-not-immediate',
        question:
          'Session items have a correct numeric TTL attribute. Some sessions that expired an hour ago are still returned by queries. What should the application do?',
        correct:
          'Expect that: TTL deletes expired items in the background some time after expiry, so queries should also filter out items whose expiry time has passed',
        wrong: [
          'Report a bug: TTL guarantees deletion within a second of expiry',
          'Lower the table’s read capacity so the TTL process gets more throughput',
          'Recreate the table, because TTL is stuck',
        ],
        why: 'TTL is a free background clean-up, not a precise timer: expired items can remain for a while (AWS documents this as typically within a few days). If expiry matters for correctness, check the expiry time in the query (a filter or a sort-key condition) or in code.',
      },
    ],
  ),
  ...scenarioFamily(
    'aws-s3-access',
    2,
    'S3 is private unless something grants access. Which option grants exactly what is needed, for as short a time as needed?',
    [
      {
        key: 'private-by-default',
        difficulty: 1,
        question:
          'A developer creates a bucket, uploads `logo.png` and opens the object URL in a browser. The response is an `AccessDenied` XML error. Why?',
        correct:
          'New buckets and objects are private by default; nothing grants anonymous users read access',
        wrong: [
          'The object needs a few hours to replicate before it can be read',
          'S3 objects can only be read through the AWS CLI',
          'PNG files must be uploaded with a special content type to be downloadable',
        ],
        why: 'S3 denies anonymous requests unless a policy grants them, and Block Public Access is on by default for new buckets. That is the safe default. To serve content to the public, put CloudFront in front of the private bucket; to share one object temporarily, use a presigned URL.',
      },
      {
        key: 'direct-upload',
        question:
          'Users of a web app upload profile pictures. The team wants the browser to upload straight to S3 without making the bucket public. What fits?',
        correct:
          'The backend checks the user and returns a presigned PUT URL for one specific key with a short expiry; the browser uploads with it',
        wrong: [
          'Add a bucket policy allowing `s3:PutObject` for `"Principal": "*"`',
          'Ship an IAM user’s access key in the JavaScript bundle',
          'Enable static website hosting, which makes the bucket accept uploads',
        ],
        why: 'A presigned URL carries a signature made with the backend’s credentials, limited to one operation on one key until it expires, so the browser never sees AWS credentials. A public-write bucket lets anyone upload anything; keys in a bundle are public the moment the page loads; website hosting only serves content.',
      },
      {
        key: 'block-public-access',
        difficulty: 3,
        question:
          'A team wants to host a public marketing site from S3. Adding a bucket policy with `"Principal": "*"` and `s3:GetObject` fails with AccessDenied, even for an administrator. What is going on, and what is the recommended setup?',
        correct:
          'Block Public Access prevents public bucket policies; keep it on and serve the site through CloudFront with origin access control to the private bucket',
        wrong: [
          'Administrators cannot edit bucket policies; only the root user can',
          'Bucket policies cannot use `"Principal": "*"`; list every visitor’s account id instead',
          'The bucket must first be emptied before a policy can be added',
        ],
        why: 'Block Public Access (at the bucket or account level) rejects policies that would make data public. Turning it off is possible but makes any later mistake public too. CloudFront with origin access control reads from the private bucket on behalf of visitors, and adds HTTPS, caching and a custom domain.',
      },
      {
        key: 'presigned-expires-early',
        difficulty: 4,
        question:
          'A Lambda function generates presigned GET URLs with an expiry of 7 days. Users report the links stop working after a few hours, with an error that the token has expired. Why?',
        correct:
          'The URLs were signed with the function’s temporary role credentials, and a presigned URL stops working when the credentials that signed it expire, whatever expiry was requested',
        wrong: [
          'S3 caps all presigned URLs at one hour',
          'The objects were moved to another storage class, which invalidates URLs',
          'Browsers delete query strings longer than a few hours',
        ],
        why: 'A presigned URL is only as valid as the credentials behind its signature. Role sessions (Lambda, ECS, AssumeRole) are short-lived, so links signed with them die with the session. For long-lived sharing, sign with credentials that live long enough (carefully), or better, issue fresh links on demand from an endpoint that checks the user.',
      },
    ],
  ),
];
