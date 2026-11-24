import type { ScenarioSource } from '@pracstack/content-model';
import { cs, plain, text } from '../skill-mastery/helpers';
import { blanks, challengeTask, predict, questionTask, single } from './builders';

const ID = 'secure-customer-api';

export const secureCustomerApi: ScenarioSource = {
  id: ID,
  version: 1,
  title: 'Secure the Customer API',
  summary:
    'Fix the findings of a penetration test: broken object-level authorization, excessive data exposure and leaking error details.',
  difficulty: 'hard',
  estimatedMinutes: 80,
  technologies: ['C#', 'ASP.NET Core', 'Authorization', 'OWASP API Security'],
  relatedSkillIds: [
    'aspnet-http-rest',
    'aspnet-minimal-apis-routing',
    'eng-secure-coding',
    'az-identity-security',
  ],
  context: text(
    'Lindqvist Energy (a fictional regional energy supplier) lets households and small businesses manage their contracts in a customer portal. Before a new release, an external penetration test of the portal’s API returned three high-severity findings. The release is blocked until they are fixed and re-tested.',
    'You are on the Customer Platform team that owns the API. Authentication is handled by the company’s identity provider, which issues a token whose subject is the user id; support agents get the role `support`.',
  ),
  requirements: [
    {
      kind: 'list',
      items: [
        'Every customer endpoint requires an authenticated user.',
        'Customers can only read and change their own records; support agents can read every record but change none.',
        'Responses expose only what the portal displays: id, name and email.',
        'Errors never reveal exception details, stack traces or whether another customer’s record exists.',
      ],
    },
  ],
  acceptanceCriteria: [
    'The API passes the hidden HTTP tests for 401, 404 and 403 cases, the DTO and safe validation errors.',
    'A request for another customer’s record is indistinguishable from a request for a record that does not exist.',
    'No response contains `passwordHash`, `taxId` or `ownerUserId`.',
    'An invalid email returns 400 validation problem details without echoing the exception or the input.',
    'Unhandled exceptions are turned into a generic problem details response in production.',
  ],
  artifacts: [
    {
      id: 'pentest-findings',
      title: 'Penetration test findings (excerpt)',
      description: 'The three findings that block the release.',
      snippet: plain(`PT-01  HIGH  Broken object level authorization (OWASP API1:2023)
       GET /customers/2 with a token for user "alice" returns Bob's record (200).
       Ids are sequential: all 180,000 customers can be enumerated.

PT-02  HIGH  Excessive data exposure (OWASP API3:2023, broken object property level authorization)
       GET /customers/{id} returns passwordHash and taxId.

PT-03  MEDIUM  Information disclosure through error messages
       PUT /customers/1/email with {"email":"x"} returns 500:
       {"status":500,"detail":"System.ArgumentException: Invalid email 'x' for customer 1. (Parameter 'email')
          at CustomerStore.UpdateEmail(Int32 id, String email) in /src/Customers/CustomerStore.cs:line 41
          at Program.<>c.<<Main>$>b__0_2(Int32 id, UpdateEmailRequest request, CustomerStore store) ..."}`),
    },
    {
      id: 'http-trace',
      title: 'HTTP trace from the test',
      description: 'The request and response behind PT-01 and PT-02.',
      snippet: plain(`GET /customers/2 HTTP/1.1
Authorization: Bearer eyJhbGciOi...   (sub = "alice")

HTTP/1.1 200 OK
Content-Type: application/json; charset=utf-8
{"id":2,"ownerUserId":"bob","name":"Bob Okafor","email":"bob@example.com",
 "passwordHash":"AQAAAAIAAYagAAAAEP0x9Q...","taxId":"DE-987654321"}`),
    },
    {
      id: 'decision-record',
      title: 'Architecture decision: 404 for records you may not see',
      description: 'The team’s decision on status codes, recorded before the fix.',
      snippet: plain(`ADR-014  Status codes for object-level authorization
Context   A 403 for /customers/{id} confirms that the id exists, which helps enumeration.
Decision  Reads and updates of a record the caller may not read return 404, exactly like a
          missing record. 403 is used only when the caller can see the record but the
          action is not allowed (support agents changing customer data).
Status    Accepted`),
    },
  ],
  tasks: [
    challengeTask(
      'fix-the-api',
      'Fix the findings in the API',
      'secure-customer-api',
      'Start from the insecure but working API and fix PT-01, PT-02 and PT-03. The hidden tests call your API over HTTP as anonymous users, customers and support agents.',
    ),
    questionTask(
      'claims',
      'Predict what the authenticated user looks like',
      predict({
        id: `${ID}-claims`,
        difficulty: 3,
        prompt:
          'Your endpoints read the user from a `ClaimsPrincipal` built by the authentication handler. What does this program print?',
        code: cs(`using System.Security.Claims;

var identity = new ClaimsIdentity(
    [new Claim(ClaimTypes.NameIdentifier, "bob"), new Claim(ClaimTypes.Role, "support")],
    authenticationType: "Bearer");
var user = new ClaimsPrincipal(identity);
Console.WriteLine(user.Identity?.IsAuthenticated);
Console.WriteLine(user.IsInRole("support"));
Console.WriteLine(user.IsInRole("Support"));
Console.WriteLine(user.FindFirstValue(ClaimTypes.NameIdentifier));

var anonymous = new ClaimsPrincipal(new ClaimsIdentity());
Console.WriteLine(anonymous.Identity?.IsAuthenticated);`),
        output: 'True\nTrue\nFalse\nbob\nFalse',
        hint: 'An identity counts as authenticated when it has an authentication type. Role checks compare claim values exactly.',
        why: '`IsAuthenticated` is true when the identity was created with an authentication type, and false for an identity without one, which is what an anonymous request gets; `RequireAuthorization()` relies on this to return 401. `IsInRole` compares the role claim value with an ordinal, case-sensitive comparison, so `"Support"` does not match `"support"`: keep role names in constants. The user id comes from the `NameIdentifier` claim (the token’s subject), never from a header or body field the client controls.',
      }),
    ),
    questionTask(
      'over-posting',
      'Spot the mass-assignment flaw',
      single({
        id: `${ID}-over-posting`,
        difficulty: 4,
        prompt:
          'A colleague adds a “update my profile” endpoint that binds the request body straight to the entity. It checks ownership correctly. What is still wrong?',
        code: cs(`using System.Security.Claims;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

public sealed class CustomerEntity
{
    public int Id { get; set; }
    public string OwnerUserId { get; set; } = "";
    public string Name { get; set; } = "";
    public string Email { get; set; } = "";
    public bool IsVip { get; set; }
    public decimal CreditLimit { get; set; }
}

public static class ProfileEndpoints
{
    public static void Map(IEndpointRouteBuilder app, Dictionary<int, CustomerEntity> db) =>
        app.MapPut("/customers/{id:int}", (int id, CustomerEntity input, ClaimsPrincipal user) =>
        {
            if (!db.TryGetValue(id, out var existing) ||
                existing.OwnerUserId != user.FindFirstValue(ClaimTypes.NameIdentifier))
            {
                return Results.NotFound();
            }
            input.Id = id;
            db[id] = input;   // replaces every property with what the client sent
            return Results.NoContent();
        }).RequireAuthorization();
}`),
        correct:
          'Over-posting (mass assignment): a customer can send `isVip`, `creditLimit` or even another `ownerUserId` and they are saved. Bind a request DTO with only the editable fields and copy those onto the entity',
        wrong: [
          'Nothing: the ownership check runs before the update, so the request is safe',
          'The endpoint should return 403 instead of 404 when the record belongs to someone else',
          'Model binding cannot bind `CustomerEntity` because it has no constructor parameters',
        ],
        hint: 'Which properties of `CustomerEntity` should a customer be able to change?',
        why: 'The ownership check is right, but the body is bound to the whole entity, so every property becomes client-controlled: the caller can make themselves VIP, raise their credit limit, or set `OwnerUserId` to hand the record to (or take it from) another user. This is OWASP API3 (broken object property level authorization), the write-side twin of PT-02. A request DTO such as `UpdateProfileRequest(string Name, string Email)` makes the editable surface explicit. 404 is the team’s decision for records the caller may not see (ADR-014), and the binder handles settable properties fine.',
      }),
    ),
    questionTask(
      'unguessable-ids',
      'Judge a proposed shortcut',
      single({
        id: `${ID}-unguessable-ids`,
        difficulty: 3,
        prompt:
          'To close PT-01 quickly, someone proposes replacing the sequential integer ids with random GUIDs and skipping the ownership check, “because nobody can guess a GUID”. What is the right response?',
        correct:
          'Random ids make enumeration harder but are not authorization: ids leak through URLs, logs, browser history, support tickets and other APIs. The per-object ownership check is still required; GUIDs can be an extra layer',
        wrong: [
          'Accept it: a random GUID has 122 bits of entropy, so the finding is closed',
          'Accept it, as long as the GUIDs are also encrypted in the URL',
          'Reject it, because GUID primary keys are not supported by SQL Server',
        ],
        hint: 'Authorization asks “may this user access this object?”, not “could this user have guessed its id?”.',
        why: 'Broken object-level authorization is fixed by checking, on every request, that the authenticated user may access the specific object. Unguessable ids only reduce one way of discovering ids; any id that is shared, logged or returned by another endpoint is then usable by anyone with a token. Defense in depth is fine, but not instead of the check.',
      }),
    ),
    questionTask(
      'safe-errors',
      'Configure safe error responses',
      blanks({
        id: `${ID}-safe-errors`,
        difficulty: 3,
        prompt:
          'PT-03 also asks for a safety net: unhandled exceptions in production must return a generic RFC 7807 problem details response, never the exception. Complete the two calls (method names only).',
        template: cs(`using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.DependencyInjection;

public static class ErrorHandling
{
    public static void AddServices(WebApplicationBuilder builder) =>
        builder.Services.{{blank:services}}();

    public static void UsePipeline(WebApplication app) =>
        app.{{blank:middleware}}();
}`),
        accepted: { services: ['AddProblemDetails'], middleware: ['UseExceptionHandler'] },
        caseSensitive: true,
        hint: 'One call registers the service that writes problem details; the other adds the middleware that catches unhandled exceptions.',
        why: '`AddProblemDetails()` registers `IProblemDetailsService`, and `UseExceptionHandler()` (with no arguments, since .NET 7) catches unhandled exceptions and uses it to write a generic `application/problem+json` 500 response. The exception is still logged on the server, where it belongs. Expected failures, such as an invalid email, should not reach this safety net at all: they are validation results (400), as in the API task.',
      }),
    ),
  ],
  limitations:
    'The API is tested over real HTTP with a simulated authentication scheme (request headers instead of signed tokens), so token validation, the identity provider, HTTPS, rate limiting and logging are not covered by the automated grading.',
};
