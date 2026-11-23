import type { QuestionSource } from '@pracstack/content-model';
import { cs, json, plain } from '../helpers';
import { choiceFamily, outputFamily, web } from './builders';
import { HEADER_AUTH_SERVICES, HEADER_AUTH_TYPE, HEADER_AUTH_USINGS, SEND_AS } from './shared';

/*
 * Input validation and error handling, and API security. Programs run in the
 * real C# runner; HTTP ones host a real app with a test authentication handler.
 */

// ================================================================ Validation and errors

const controllerSetup = `// The program is compiled in memory, so its controllers are registered explicitly.
builder.Services.AddControllers().AddApplicationPart(typeof(OrdersController).Assembly);`;

export const validationErrorFamilies: readonly QuestionSource[] = [
  ...outputFamily(
    'aspnet-val-annotations',
    1,
    [
      '`Validator.TryValidateObject` returns whether the object is valid and fills the list with one result per failed rule.',
    ],
    [
      {
        key: 'range',
        code: `using System.ComponentModel.DataAnnotations;

var signup = new Signup { Email = "ana@example.com", Age = 15 };
var errors = new List<ValidationResult>();
var valid = Validator.TryValidateObject(signup, new ValidationContext(signup), errors, validateAllProperties: true);
Console.WriteLine(valid);
foreach (var error in errors) Console.WriteLine(error.ErrorMessage);

class Signup
{
    [Required] public string? Email { get; set; }
    [Range(18, 120)] public int Age { get; set; }
}`,
        output: 'False\nThe field Age must be between 18 and 120.',
        why: 'The email is present, so `[Required]` passes; 15 is outside `[Range(18, 120)]`, so validation fails with the attribute’s default message.',
      },
      {
        key: 'required',
        code: `using System.ComponentModel.DataAnnotations;

var signup = new Signup { Age = 30 };
var errors = new List<ValidationResult>();
var valid = Validator.TryValidateObject(signup, new ValidationContext(signup), errors, validateAllProperties: true);
Console.WriteLine(valid);
foreach (var error in errors) Console.WriteLine(error.ErrorMessage);

class Signup
{
    [Required] public string? Email { get; set; }
    [Range(18, 120)] public int Age { get; set; }
}`,
        output: 'False\nThe Email field is required.',
        why: '`Email` was never set, so `[Required]` fails. Age 30 is in range. Note the nullable `string?`: the annotation, not the C# type, is what makes the field required at runtime.',
      },
    ],
    'program',
  ),
  ...outputFamily(
    'aspnet-val-api-controller',
    2,
    ['With `[ApiController]`, an invalid model is rejected before the action runs.'],
    [
      {
        key: 'invalid',
        code: web({
          full: true,
          usings: [
            'System.ComponentModel.DataAnnotations',
            'System.Net.Http.Json',
            'System.Text.Json',
            'Microsoft.AspNetCore.Mvc',
          ],
          services: controllerSetup,
          app: 'app.MapControllers();',
          client: `var res = await http.PostAsJsonAsync("/api/orders", new { quantity = 0 });
var body = JsonDocument.Parse(await res.Content.ReadAsStringAsync()).RootElement;
Console.WriteLine((int)res.StatusCode);
Console.WriteLine(string.Join(",", body.GetProperty("errors").EnumerateObject().Select(e => e.Name).Order()));`,
          types: `[ApiController]
[Route("api/orders")]
public class OrdersController : ControllerBase
{
    [HttpPost]
    public IActionResult Create(NewOrder order)
    {
        Console.WriteLine("action ran");
        return Ok();
    }
}

public class NewOrder
{
    [Required] public string? Sku { get; set; }
    [Range(1, 100)] public int Quantity { get; set; }
}`,
        }),
        output: '400\nQuantity,Sku',
        why: 'Both rules fail (no `Sku`, quantity 0), so `[ApiController]` returns a 400 validation problem with an `errors` entry per field, and the action never runs, which is why "action ran" is not printed.',
      },
      {
        key: 'valid',
        code: web({
          full: true,
          usings: [
            'System.ComponentModel.DataAnnotations',
            'System.Net.Http.Json',
            'Microsoft.AspNetCore.Mvc',
          ],
          services: controllerSetup,
          app: 'app.MapControllers();',
          client: `var res = await http.PostAsJsonAsync("/api/orders", new { sku = "A1", quantity = 3 });
Console.WriteLine((int)res.StatusCode);
Console.WriteLine(res.Headers.Location?.AbsolutePath);`,
          types: `[ApiController]
[Route("api/orders")]
public class OrdersController : ControllerBase
{
    [HttpPost]
    public IActionResult Create(NewOrder order)
    {
        Console.WriteLine($"action ran for {order.Sku}");
        return CreatedAtAction(nameof(Get), new { id = 7 }, order);
    }

    [HttpGet("{id:int}")]
    public IActionResult Get(int id) => Ok();
}

public class NewOrder
{
    [Required] public string? Sku { get; set; }
    [Range(1, 100)] public int Quantity { get; set; }
}`,
        }),
        output: 'action ran for A1\n201\n/api/orders/7',
        why: 'The model is valid, so the action runs. `CreatedAtAction` returns 201 and builds the `Location` URL from the `Get` action’s route with `id = 7`.',
      },
    ],
  ),
  ...choiceFamily(
    'aspnet-val-400-vs-422',
    2,
    'Apply the stated convention: could the server even read the request into the expected shape?',
    [
      {
        key: 'malformed',
        question:
          'The API’s convention: 400 for requests that cannot be read (malformed JSON, wrong types), 422 for well-formed requests that break a business rule. Which status fits this request?',
        code: plain(`POST /api/transfers HTTP/1.1
Content-Type: application/json

{ "fromAccount": "A-1", "toAccount": "B-2", "amount": 25.00`),
        correct: '`400 Bad Request`',
        wrong: ['`422 Unprocessable Content`', '`404 Not Found`', '`500 Internal Server Error`'],
        why: 'The JSON is cut off (no closing brace), so the server cannot even parse it: that is a 400 under this convention. 422 is reserved for content that parses fine but is semantically unacceptable. It is not a server failure, so not 500.',
      },
      {
        key: 'business-rule',
        question:
          'The API’s convention: 400 for requests that cannot be read (malformed JSON, wrong types), 422 for well-formed requests that break a business rule. Account A-1 holds 10.00. Which status fits this request?',
        code: plain(`POST /api/transfers HTTP/1.1
Content-Type: application/json

{ "fromAccount": "A-1", "toAccount": "B-2", "amount": 25.00 }`),
        correct: '`422 Unprocessable Content`',
        wrong: ['`400 Bad Request`', '`404 Not Found`', '`500 Internal Server Error`'],
        why: 'The request is well-formed and every field has the right type, but the transfer breaks a business rule (insufficient funds), which the convention maps to 422 with a problem details body explaining why. A 400 would tell the client its request was malformed, which it is not.',
      },
      {
        key: 'wrong-type',
        question:
          'The API’s convention: 400 for requests that cannot be read (malformed JSON, wrong types), 422 for well-formed requests that break a business rule. Which status fits this request?',
        code: plain(`POST /api/transfers HTTP/1.1
Content-Type: application/json

{ "fromAccount": "A-1", "toAccount": "B-2", "amount": "twenty-five" }`),
        correct: '`400 Bad Request`',
        wrong: ['`422 Unprocessable Content`', '`415 Unsupported Media Type`', '`409 Conflict`'],
        why: '`amount` cannot be converted to a number, so the body cannot be bound to the request model: a 400 under this convention. The media type is correct JSON, so not 415, and nothing conflicts with the resource’s state, so not 409.',
      },
    ],
  ),
  ...outputFamily(
    'aspnet-val-minimal-manual',
    3,
    [
      'Nothing validates a minimal API parameter unless you (or a filter) do it. `Results.ValidationProblem` takes a field-to-messages dictionary.',
    ],
    [
      {
        key: 'manual-check',
        code: web({
          usings: ['System.ComponentModel.DataAnnotations', 'System.Net.Http.Json'],
          app: `app.MapPost("/orders", (NewOrder order) =>
{
    var results = new List<ValidationResult>();
    if (!Validator.TryValidateObject(order, new ValidationContext(order), results, validateAllProperties: true))
    {
        var errors = results
            .GroupBy(r => r.MemberNames.First())
            .ToDictionary(g => g.Key, g => g.Select(r => r.ErrorMessage!).ToArray());
        return Results.ValidationProblem(errors);
    }
    return Results.Created($"/orders/{order.Sku}", order);
});`,
          client: `foreach (var quantity in new[] { 0, 2 })
{
    var res = await http.PostAsJsonAsync("/orders", new { sku = "A1", quantity });
    Console.WriteLine((int)res.StatusCode);
}`,
          types: `class NewOrder
{
    [Required] public string? Sku { get; set; }
    [Range(1, 100)] public int Quantity { get; set; }
}`,
        }),
        output: '400\n201',
        why: 'The handler runs the data annotation validator itself and turns failures into a validation problem (400 with an `errors` dictionary). Quantity 0 fails `[Range]`; quantity 2 passes and the order is created.',
      },
      {
        key: 'no-check',
        code: web({
          usings: ['System.ComponentModel.DataAnnotations', 'System.Net.Http.Json'],
          app: `app.MapPost("/orders", (NewOrder order) => Results.Created($"/orders/{order.Sku}", order));`,
          client: `foreach (var quantity in new[] { 0, 500 })
{
    var res = await http.PostAsJsonAsync("/orders", new { sku = "A1", quantity });
    Console.WriteLine((int)res.StatusCode);
}`,
          types: `class NewOrder
{
    [Required] public string? Sku { get; set; }
    [Range(1, 100)] public int Quantity { get; set; }
}`,
        }),
        output: '201\n201',
        why: 'The annotations are only metadata: this endpoint never runs a validator, and nothing in the program enables validation for minimal APIs, so 0 and 500 are both accepted. Unlike `[ApiController]` controllers, minimal APIs need validation to be added explicitly.',
      },
    ],
  ),
  ...outputFamily(
    'aspnet-val-exception-leak',
    3,
    [
      'What does ASP.NET Core put in the body of an unhandled-exception response in each environment, and with `UseExceptionHandler`?',
    ],
    [
      {
        key: 'development',
        code: web({
          development: true,
          app: `app.MapGet("/report", string () =>
    throw new InvalidOperationException("Login failed for user 'sa' with password 'Pr0d-Secret!'"));`,
          client: `var res = await http.GetAsync("/report");
var body = await res.Content.ReadAsStringAsync();
Console.WriteLine((int)res.StatusCode);
Console.WriteLine(body.Contains("Pr0d-Secret!"));`,
        }),
        output: '500\nTrue',
        why: 'In the Development environment the developer exception page is on, and it returns the exception message and stack trace to the caller, including the secret. That is useful on a developer machine and a serious leak anywhere else; it is why the environment must never be Development in production.',
      },
      {
        key: 'handler',
        code: web({
          services: 'builder.Services.AddProblemDetails();',
          app: `app.UseExceptionHandler();
app.MapGet("/report", string () =>
    throw new InvalidOperationException("Login failed for user 'sa' with password 'Pr0d-Secret!'"));`,
          client: `var res = await http.GetAsync("/report");
var body = await res.Content.ReadAsStringAsync();
Console.WriteLine((int)res.StatusCode);
Console.WriteLine(res.Content.Headers.ContentType?.MediaType);
Console.WriteLine(body.Contains("Pr0d-Secret!"));`,
        }),
        output: '500\napplication/problem+json\nFalse',
        why: 'In Production, `UseExceptionHandler` with `AddProblemDetails` answers with a generic problem details body ("An error occurred while processing your request.") and no exception message. The details belong in the server logs, not in the response.',
      },
    ],
  ),
  ...outputFamily(
    'aspnet-val-validate-all-properties',
    4,
    ['Look at the last argument of `TryValidateObject`. Without it, which attributes are checked?'],
    [
      {
        key: 'range-skipped',
        code: `using System.ComponentModel.DataAnnotations;

var smtp = new SmtpSettings { Host = "mail.internal", Port = 70000 };
var errors = new List<ValidationResult>();
Console.WriteLine(Validator.TryValidateObject(smtp, new ValidationContext(smtp), errors));
Console.WriteLine(errors.Count);

class SmtpSettings
{
    [Required] public string? Host { get; set; }
    [Range(1, 65535)] public int Port { get; set; }
}`,
        output: 'True\n0',
        why: 'Without `validateAllProperties: true`, `TryValidateObject` only checks `[Required]` attributes. The out-of-range port is never looked at and the object is reported valid. Always pass `validateAllProperties: true` when validating by hand.',
      },
      {
        key: 'required-only',
        code: `using System.ComponentModel.DataAnnotations;

var smtp = new SmtpSettings { Port = 0 };
var errors = new List<ValidationResult>();
Console.WriteLine(Validator.TryValidateObject(smtp, new ValidationContext(smtp), errors));
foreach (var error in errors) Console.WriteLine(error.ErrorMessage);

class SmtpSettings
{
    [Required] public string? Host { get; set; }
    [Range(1, 65535)] public int Port { get; set; }
}`,
        output: 'False\nThe Host field is required.',
        why: 'The missing host fails `[Required]`, which is always checked. Port 0 also breaks `[Range]`, but without `validateAllProperties: true` that rule is skipped, so the caller sees only one of the two problems.',
      },
    ],
    'program',
  ),
  ...outputFamily(
    'aspnet-val-exception-handlers',
    4,
    [
      'Each `IExceptionHandler` decides whether it handled the exception; if none does, the default problem details response is used.',
    ],
    [
      {
        key: 'not-found',
        code: web({
          usings: ['Microsoft.AspNetCore.Diagnostics'],
          services: `builder.Services.AddProblemDetails();
builder.Services.AddExceptionHandler<NotFoundHandler>();`,
          app: `app.UseExceptionHandler();
app.MapGet("/orders/{id:int}", (int id) => id == 1 ? "order 1" : throw new NotFoundException($"order {id}"));
app.MapGet("/crash", string () => throw new InvalidOperationException("connection string: Password=s3cret"));`,
          client: `foreach (var path in new[] { "/orders/1", "/orders/2", "/crash" })
{
    var res = await http.GetAsync(path);
    var body = await res.Content.ReadAsStringAsync();
    Console.WriteLine($"{path} {(int)res.StatusCode} {body.Contains("s3cret")}");
}`,
          types: `class NotFoundException(string message) : Exception(message);

class NotFoundHandler : IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(HttpContext context, Exception exception, CancellationToken cancellationToken)
    {
        if (exception is not NotFoundException) return false;
        context.Response.StatusCode = StatusCodes.Status404NotFound;
        await context.Response.WriteAsJsonAsync(new { title = exception.Message }, cancellationToken);
        return true;
    }
}`,
        }),
        output: '/orders/1 200 False\n/orders/2 404 False\n/crash 500 False',
        why: 'The handler maps the domain `NotFoundException` to a 404 and returns `true`. For any other exception it returns `false`, so the built-in handler writes the generic 500 problem details, without the exception message, so the password does not leak.',
      },
      {
        key: 'leaky-handler',
        code: web({
          usings: ['Microsoft.AspNetCore.Diagnostics'],
          services: `builder.Services.AddProblemDetails();
builder.Services.AddExceptionHandler<CatchAllHandler>();`,
          app: `app.UseExceptionHandler();
app.MapGet("/crash", string () => throw new InvalidOperationException("connection string: Password=s3cret"));`,
          client: `var res = await http.GetAsync("/crash");
var body = await res.Content.ReadAsStringAsync();
Console.WriteLine($"{(int)res.StatusCode} {body.Contains("s3cret")}");`,
          types: `class CatchAllHandler : IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(HttpContext context, Exception exception, CancellationToken cancellationToken)
    {
        context.Response.StatusCode = StatusCodes.Status500InternalServerError;
        await context.Response.WriteAsJsonAsync(new { title = "Server error", detail = exception.Message }, cancellationToken);
        return true;
    }
}`,
        }),
        output: '500 True',
        why: 'This handler handles every exception and copies `exception.Message` into the response. Exception messages from libraries often contain connection strings, SQL, file paths or user data, so the secret reaches the client even though the environment is Production. Map only known, safe exception types to messages; log the rest and return a generic error.',
      },
    ],
  ),
  ...choiceFamily(
    'aspnet-val-safe-messages',
    4,
    'An error response must help a legitimate client without helping an attacker.',
    [
      {
        key: 'correlation',
        question:
          'Support wants enough information to investigate failed requests in production. Which error response design is appropriate?',
        correct:
          'A generic message plus a trace id in the problem details; the full exception and stack trace are logged server-side under that id',
        wrong: [
          'The exception message and stack trace in the response body, so support can read them from screenshots',
          'A `200 OK` with `{ "success": false }`, so clients never see 5xx errors',
          'The SQL statement that failed, so developers can reproduce the problem',
        ],
        why: 'A trace id links the user’s report to the detailed server log without exposing internals. Stack traces and SQL reveal libraries, versions, table names and sometimes data, which helps attackers. Hiding failures behind 200 breaks retries, monitoring and caching.',
      },
      {
        key: 'enumeration',
        question: 'Which response to a failed login is safest?',
        code: plain(`POST /api/auth/login
{ "email": "ana@example.com", "password": "wrong" }`),
        correct:
          '`401` with "Invalid email or password." for both an unknown email and a wrong password',
        wrong: [
          '`404` "No account with this email." or `401` "Wrong password.", whichever applies',
          '`401` "Wrong password for ana@example.com."',
          '`400` with the validation details of the stored password hash',
        ],
        why: 'Different answers for "unknown email" and "wrong password" let an attacker find which emails have accounts (user enumeration) and then target them. One identical message for both cases removes that signal. Response time should not differ either.',
      },
    ],
  ),
  ...outputFamily(
    'aspnet-val-nullable-not-validation',
    5,
    [
      'Nullable reference type annotations are compile-time hints. Does the JSON deserializer enforce them by default?',
    ],
    [
      {
        key: 'default',
        code: web({
          app: `app.MapPost("/customers", (NewCustomer customer) => customer.Name.ToUpperInvariant());`,
          client: `foreach (var json in new[] { "{}", "{\\"name\\":\\"ana\\"}" })
{
    var res = await http.PostAsync("/customers", new StringContent(json, Encoding.UTF8, "application/json"));
    Console.WriteLine((int)res.StatusCode);
}`,
          types: 'record NewCustomer(string Name);',
        }),
        output: '500\n200',
        why: '`string Name` is non-nullable only for the compiler. By default the deserializer happily creates `NewCustomer` with `Name = null` when the property is missing, and the handler throws a `NullReferenceException`: a 500 for what is really a client error. Validate input explicitly, or make the serializer enforce required members.',
      },
      {
        key: 'required-parameters',
        code: web({
          app: `app.MapPost("/customers", (NewCustomer customer) => customer.Name.ToUpperInvariant());`,
          services: `builder.Services.ConfigureHttpJsonOptions(options =>
    options.SerializerOptions.RespectRequiredConstructorParameters = true);`,
          client: `foreach (var json in new[] { "{}", "{\\"name\\":\\"ana\\"}" })
{
    var res = await http.PostAsync("/customers", new StringContent(json, Encoding.UTF8, "application/json"));
    Console.WriteLine((int)res.StatusCode);
}`,
          types: 'record NewCustomer(string Name);',
        }),
        output: '400\n200',
        why: 'With `RespectRequiredConstructorParameters`, a constructor parameter without a default value must be present in the JSON. The missing `name` now fails deserialization, which minimal APIs report as 400 Bad Request, instead of reaching the handler as null and crashing with a 500.',
      },
    ],
  ),
  ...choiceFamily(
    'aspnet-val-where-rules-live',
    5,
    'Separate "is this request well-formed?" from "is this operation allowed given the current data?"',
    [
      {
        key: 'credit-limit',
        question:
          'Orders must not push a customer over their credit limit, which is stored in the database. Orders arrive through the HTTP API and through a message queue consumer. Where should this rule be enforced?',
        correct:
          'In the domain or application service that places orders, used by both entry points',
        wrong: [
          'With a custom validation attribute on the HTTP request DTO',
          'In the HTTP endpoint handler, before calling the service',
          'In the front-end form, which already has the customer’s limit',
        ],
        why: 'The rule depends on stored data and must hold however an order arrives. Putting it in the shared service enforces it once for both entry points. A DTO attribute or endpoint check covers HTTP only, and a front-end check is trivially bypassed by calling the API directly.',
      },
      {
        key: 'shape-vs-rule',
        question: 'Which check belongs on the request DTO rather than in the domain logic?',
        correct: '`quantity` must be a whole number from 1 to 100',
        wrong: [
          'The product must still be in stock',
          'A customer may have at most three open returns',
          'A discount code may be used only once per customer',
        ],
        why: 'A range on a single field can be checked from the request alone, so it fits declarative DTO validation and gives the client immediate field-level errors. The other three rules depend on the current state of the system (stock, open returns, usage history), so they belong in the domain or application layer.',
      },
    ],
  ),
];

// ================================================================ Security

const invoiceStore = `record Invoice(int Id, string Owner, decimal Total);

static class Invoices
{
    public static readonly Dictionary<int, Invoice> All = new()
    {
        [1] = new(1, "ana", 120.00m),
        [2] = new(2, "bob", 75.50m),
    };
}`;

const authPolicyProgram = (
  policy: string,
  users: string,
  checks: string,
) => `using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.Extensions.DependencyInjection;

var services = new ServiceCollection();
services.AddLogging();
services.AddAuthorization(options =>
    options.AddPolicy("Policy", policy => policy${policy}));
var authorization = services.BuildServiceProvider().GetRequiredService<IAuthorizationService>();

ClaimsPrincipal User(params Claim[] claims) => new(new ClaimsIdentity(claims, "test"));
${users.trim()}

${checks.trim()}
`;

export const securityFamilies: readonly QuestionSource[] = [
  ...choiceFamily(
    'aspnet-sec-authn-vs-authz',
    1,
    'Authentication establishes who the caller is; authorization decides what that caller may do.',
    [
      {
        key: 'no-token',
        question:
          'A request to a protected endpoint carries no credentials at all. Which status should the API return?',
        correct: '`401 Unauthorized`',
        wrong: ['`403 Forbidden`', '`404 Not Found`', '`400 Bad Request`'],
        why: 'Despite its name, 401 means "not authenticated": the client should authenticate and try again (the response includes a `WWW-Authenticate` challenge). 403 is for a caller whose identity is known but who is not allowed.',
      },
      {
        key: 'no-permission',
        question:
          'A signed-in user with a valid token calls `DELETE /api/users/7`, which requires the admin role, but the user is not an admin. Which status fits?',
        correct: '`403 Forbidden`',
        wrong: ['`401 Unauthorized`', '`400 Bad Request`', '`405 Method Not Allowed`'],
        why: 'The user is authenticated, so asking them to authenticate again (401) would not help; they lack permission, which is 403. The request itself is well-formed, so not 400, and 405 is about the HTTP method not being supported by the resource at all, for anyone.',
      },
      {
        key: 'which-step',
        question:
          'The API checks a token’s signature and expiry and reads the user id and roles from it. Which step is this?',
        correct: 'Authentication: establishing who the caller is',
        wrong: [
          'Authorization: deciding what the caller may do',
          'Input validation: checking the request body',
          'Encryption: hiding the request contents',
        ],
        why: 'Validating the token and building the user from its claims is authentication; in ASP.NET Core it produces `HttpContext.User`. Authorization comes afterwards and uses those claims to allow or deny the specific request.',
      },
    ],
  ),
  ...outputFamily(
    'aspnet-sec-live-401-403',
    2,
    [
      'Anonymous callers are challenged (401); authenticated callers who fail the policy are forbidden (403).',
    ],
    [
      {
        key: 'role-policy',
        code: web({
          usings: HEADER_AUTH_USINGS,
          services: `${HEADER_AUTH_SERVICES}
builder.Services.AddAuthorization(options =>
    options.AddPolicy("AdminOnly", policy => policy.RequireRole("admin")));`,
          app: `app.UseAuthentication();
app.UseAuthorization();
app.MapGet("/admin/stats", () => "stats").RequireAuthorization("AdminOnly");`,
          client: `${SEND_AS}
Console.WriteLine((int)(await Send("/admin/stats", null)).StatusCode);
Console.WriteLine((int)(await Send("/admin/stats", "ana")).StatusCode);
Console.WriteLine((int)(await Send("/admin/stats", "root", "admin")).StatusCode);`,
          types: HEADER_AUTH_TYPE,
        }),
        output: '401\n403\n200',
        why: 'The anonymous request is challenged with 401. "ana" is authenticated but has no admin role, so she is forbidden with 403. "root" has the role and gets the stats.',
      },
      {
        key: 'authenticated-only',
        code: web({
          usings: HEADER_AUTH_USINGS,
          services: `${HEADER_AUTH_SERVICES}
builder.Services.AddAuthorization();`,
          app: `app.UseAuthentication();
app.UseAuthorization();
app.MapGet("/profile", (ClaimsPrincipal user) => $"hello {user.Identity!.Name}").RequireAuthorization();
app.MapGet("/status", () => "up");`,
          client: `${SEND_AS}
Console.WriteLine((int)(await Send("/profile", null)).StatusCode);
Console.WriteLine(await (await Send("/profile", "ana")).Content.ReadAsStringAsync());
Console.WriteLine((int)(await Send("/status", null)).StatusCode);`,
          types: HEADER_AUTH_TYPE,
        }),
        output: '401\nhello ana\n200',
        why: '`RequireAuthorization()` without a policy name applies the default policy: any authenticated user. Anonymous callers get 401, any signed-in user passes. `/status` has no authorization metadata, so it stays public.',
      },
    ],
  ),
  ...outputFamily(
    'aspnet-sec-policies',
    3,
    [
      'All requirements of one policy must succeed. Claim values are compared exactly, including case.',
    ],
    [
      {
        key: 'claim-value',
        code: authPolicyProgram(
          '.RequireClaim("department", "finance")',
          `var ana = User(new Claim("department", "Finance"));
var bob = User(new Claim("department", "finance"));`,
          `Console.WriteLine((await authorization.AuthorizeAsync(ana, "Policy")).Succeeded);
Console.WriteLine((await authorization.AuthorizeAsync(bob, "Policy")).Succeeded);`,
        ),
        output: 'False\nTrue',
        why: '`RequireClaim(type, values)` compares claim values with ordinal (case-sensitive) comparison, so "Finance" does not satisfy "finance". Normalise claim values when issuing tokens, or write a custom requirement if case should not matter.',
      },
      {
        key: 'and',
        code: authPolicyProgram(
          `
        .RequireRole("manager")
        .RequireClaim("region", "emea")`,
          `var ana = User(new Claim(ClaimTypes.Role, "manager"), new Claim("region", "apac"));
var bob = User(new Claim(ClaimTypes.Role, "manager"), new Claim("region", "emea"));
var eve = User(new Claim("region", "emea"));`,
          `foreach (var user in new[] { ana, bob, eve })
    Console.WriteLine((await authorization.AuthorizeAsync(user, "Policy")).Succeeded);`,
        ),
        output: 'False\nTrue\nFalse',
        why: 'Each call adds a requirement, and a policy succeeds only if every requirement succeeds. Ana is a manager in the wrong region, Eve is in the right region without the role; only Bob satisfies both.',
      },
      {
        key: 'or',
        code: authPolicyProgram(
          `
        .RequireAssertion(context =>
            context.User.IsInRole("admin") || context.User.HasClaim("scope", "orders.write"))`,
          `var ana = User(new Claim("scope", "orders.read"));
var bob = User(new Claim("scope", "orders.write"));
var eve = User(new Claim(ClaimTypes.Role, "admin"));`,
          `foreach (var user in new[] { ana, bob, eve })
    Console.WriteLine((await authorization.AuthorizeAsync(user, "Policy")).Succeeded);`,
        ),
        output: 'False\nTrue\nTrue',
        why: 'Chained requirements combine with AND, so "either-or" logic is written inside one requirement, here with `RequireAssertion`. Bob has the write scope, Eve is an admin, Ana only has the read scope.',
      },
    ],
    'program',
  ),
  ...outputFamily(
    'aspnet-sec-bola-live',
    3,
    [
      'Authorization on the endpoint checks that the caller is signed in. Does anything check that the invoice belongs to the caller?',
    ],
    [
      {
        key: 'vulnerable',
        code: web({
          usings: HEADER_AUTH_USINGS,
          services: `${HEADER_AUTH_SERVICES}
builder.Services.AddAuthorization();`,
          app: `app.UseAuthentication();
app.UseAuthorization();
app.MapGet("/invoices/{id:int}", (int id) =>
    Invoices.All.TryGetValue(id, out var invoice) ? Results.Ok(invoice) : Results.NotFound())
    .RequireAuthorization();`,
          client: `${SEND_AS}
var res = await Send("/invoices/1", "bob");
Console.WriteLine($"{(int)res.StatusCode} {await res.Content.ReadAsStringAsync()}");`,
          types: `${invoiceStore}

${HEADER_AUTH_TYPE}`,
        }),
        output: '200 {"id":1,"owner":"ana","total":120.00}',
        why: 'Bob is authenticated, which is all the endpoint checks, so he can read Ana’s invoice just by changing the id in the URL. This is broken object-level authorization (BOLA, also called IDOR), the most common API vulnerability: every lookup by id must also check that the caller may access that object.',
      },
      {
        key: 'fixed',
        code: web({
          usings: HEADER_AUTH_USINGS,
          services: `${HEADER_AUTH_SERVICES}
builder.Services.AddAuthorization();`,
          app: `app.UseAuthentication();
app.UseAuthorization();
app.MapGet("/invoices/{id:int}", (int id, ClaimsPrincipal user) =>
    Invoices.All.TryGetValue(id, out var invoice) && invoice.Owner == user.Identity!.Name
        ? Results.Ok(invoice)
        : Results.NotFound())
    .RequireAuthorization();`,
          client: `${SEND_AS}
Console.WriteLine((int)(await Send("/invoices/1", "bob")).StatusCode);
Console.WriteLine((int)(await Send("/invoices/2", "bob")).StatusCode);`,
          types: `${invoiceStore}

${HEADER_AUTH_TYPE}`,
        }),
        output: '404\n200',
        why: 'The lookup now also requires that the invoice belongs to the signed-in user. Bob gets his own invoice 2, and Ana’s invoice 1 is reported as not found, so he cannot even learn that it exists.',
      },
    ],
  ),
  ...choiceFamily(
    'aspnet-sec-bola-fix',
    4,
    'Where must the identity used for the ownership check come from, and can the client change it?',
    [
      {
        key: 'owner-from-body',
        question: 'What is the security flaw in this endpoint, and what is the fix?',
        code: cs(`using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;

var app = WebApplication.CreateSlimBuilder().Build();
app.MapPut("/addresses/{id:int}", (int id, UpdateAddress request) =>
{
    var address = Store.Addresses.FirstOrDefault(a => a.Id == id && a.UserId == request.UserId);
    if (address is null) return Results.NotFound();
    address.Street = request.Street;
    return Results.NoContent();
}).RequireAuthorization();

record UpdateAddress(int UserId, string Street);
class Address { public int Id; public int UserId; public string Street = ""; }
static class Store { public static readonly List<Address> Addresses = []; }`),
        correct:
          'The owner check trusts `UserId` from the request body, which the caller controls; take the user id from the authenticated user’s claims instead',
        wrong: [
          'The endpoint should use `POST` instead of `PUT`, because it modifies data',
          'The ids should be GUIDs instead of integers, so they cannot be guessed',
          'The endpoint lacks `RequireAuthorization()`, so anonymous users can call it',
        ],
        why: 'An ownership check is only as good as the identity it compares against. Any caller can send another user’s `UserId` and edit their address. The user id must come from `HttpContext.User` (the token or cookie), never from the request. Unguessable ids only make the attack harder, and `RequireAuthorization()` is already there.',
      },
      {
        key: 'list-filter',
        question:
          'Each user should see only their own orders. Which implementation of `GET /orders?customerId=...` is correct?',
        correct:
          'Ignore any customer id from the query and filter by the customer id in the authenticated user’s claims',
        wrong: [
          'Filter by the `customerId` query parameter, which the front end always fills in with the current user’s id',
          'Filter by the `customerId` query parameter and return 403 if it is missing',
          'Return all orders and let the front end display only the current user’s',
        ],
        why: 'The front end is not a security boundary: anyone can call the API directly with another `customerId`, or read the full response. Scoping the query by the server-side identity makes it impossible to request someone else’s data.',
      },
    ],
  ),
  ...outputFamily(
    'aspnet-sec-over-posting',
    4,
    [
      'The JSON deserializer sets every property it finds a matching key for. Which properties does the bound type expose?',
    ],
    [
      {
        key: 'entity',
        code: web({
          usings: ['System.Net.Http.Json'],
          app: `var users = new List<User>();
app.MapPost("/users", (User user) =>
{
    users.Add(user);
    return $"{user.Name} admin={user.IsAdmin}";
});`,
          client: `var res = await http.PostAsJsonAsync("/users", new { name = "eve", isAdmin = true });
Console.WriteLine(await res.Content.ReadAsStringAsync());`,
          types: `class User
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
    public bool IsAdmin { get; set; }
}`,
        }),
        output: 'eve admin=True',
        why: 'The endpoint binds the stored entity directly, so the client can set any of its properties, including `IsAdmin`. This is mass assignment (over-posting): a sign-up becomes a privilege escalation.',
      },
      {
        key: 'dto',
        code: web({
          usings: ['System.Net.Http.Json'],
          app: `var users = new List<User>();
app.MapPost("/users", (SignUp request) =>
{
    var user = new User { Name = request.Name };
    users.Add(user);
    return $"{user.Name} admin={user.IsAdmin}";
});`,
          client: `var res = await http.PostAsJsonAsync("/users", new { name = "eve", isAdmin = true });
Console.WriteLine(await res.Content.ReadAsStringAsync());`,
          types: `record SignUp(string Name);

class User
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
    public bool IsAdmin { get; set; }
}`,
        }),
        output: 'eve admin=False',
        why: 'The request DTO only has `Name`, so the extra `isAdmin` key is ignored, and the server decides `IsAdmin` itself. A DTO per operation makes the writable fields explicit.',
      },
    ],
  ),
  ...choiceFamily(
    'aspnet-sec-jwt',
    4,
    'A JWT is base64url-encoded JSON plus a signature. What does the signature guarantee, and what must the API still check?',
    [
      {
        key: 'readable',
        question:
          'A developer adds the user’s tax id to the JWT payload, reasoning that "the token is signed, so it is safe". What is wrong?',
        code: json(`{
  "sub": "user-831",
  "taxId": "123-45-6789",
  "aud": "orders-api",
  "exp": 1767225600
}`),
        correct:
          'A signature protects integrity, not confidentiality: anyone holding the token can base64url-decode the payload and read the tax id',
        wrong: [
          'Nothing is wrong: a signed payload can only be read with the signing key',
          'The tax id makes the token too long for an HTTP header',
          'Claims must be strings, so the `exp` number makes the token invalid',
        ],
        why: 'A signed JWT (JWS) is encoded, not encrypted. The signature only lets the API detect changes. Tokens end up in browser storage, logs and proxies, so they must not carry sensitive data. `exp` is a number of seconds by definition.',
      },
      {
        key: 'audience',
        question:
          'The orders API receives a correctly signed, unexpired token from the company’s identity provider. Its payload is shown. What should the orders API do?',
        code: json(`{
  "iss": "https://login.example.com",
  "sub": "user-831",
  "aud": "billing-api",
  "exp": 1767225600
}`),
        correct:
          'Reject it with 401: the token was issued for a different API (`aud` is `billing-api`)',
        wrong: [
          'Accept it: the signature proves it came from the trusted issuer',
          'Accept it, but treat the user as read-only',
          'Reject it with 403, because the user lacks the orders role',
        ],
        why: 'The audience says which API the token is meant for. Accepting tokens issued for other APIs lets any service that receives a user’s token replay it against yours. A token that fails validation means the caller is not authenticated for this API: 401, not 403.',
      },
      {
        key: 'checks',
        question:
          'When an API validates incoming JWT bearer tokens, which set of checks is needed?',
        correct:
          'Signature with the issuer’s key and an expected algorithm, issuer, audience, and expiry (with a small clock skew)',
        wrong: [
          'Only the signature: if it is valid, the claims can be trusted',
          'Only expiry: an expired token is the only common attack',
          'Only that the token decodes as JSON and has a `sub` claim',
        ],
        why: 'Each check closes a different hole: the signature (with a fixed algorithm, never `none`) detects forgery, the issuer rejects tokens from other identity providers, the audience rejects tokens meant for other APIs, and expiry limits how long a stolen token works. The JWT bearer handler validates these when configured with the authority and audience.',
      },
    ],
  ),
  ...outputFamily(
    'aspnet-sec-resource-authorization',
    5,
    [
      'An `AuthorizationHandler<TRequirement, TResource>` decides using both the user and the specific resource. What if no handler is registered?',
    ],
    [
      {
        key: 'author-or-editor',
        code: `using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.Extensions.DependencyInjection;

var services = new ServiceCollection();
services.AddLogging();
services.AddAuthorization();
services.AddSingleton<IAuthorizationHandler, EditDocumentHandler>();
var authorization = services.BuildServiceProvider().GetRequiredService<IAuthorizationService>();

ClaimsPrincipal User(string name, string? role = null) => new(new ClaimsIdentity(
    role is null ? [new Claim(ClaimTypes.Name, name)] : [new Claim(ClaimTypes.Name, name), new Claim(ClaimTypes.Role, role)],
    "test"));

var draft = new Document("ana");
foreach (var user in new[] { User("ana"), User("bob"), User("cy", "editor") })
    Console.WriteLine((await authorization.AuthorizeAsync(user, draft, new EditRequirement())).Succeeded);

record Document(string Author);
class EditRequirement : IAuthorizationRequirement;

class EditDocumentHandler : AuthorizationHandler<EditRequirement, Document>
{
    protected override Task HandleRequirementAsync(AuthorizationHandlerContext context, EditRequirement requirement, Document document)
    {
        if (context.User.Identity?.Name == document.Author || context.User.IsInRole("editor"))
            context.Succeed(requirement);
        return Task.CompletedTask;
    }
}`,
        output: 'True\nFalse\nTrue',
        why: 'The decision needs the document, so it cannot be a static role or policy on the endpoint: the code loads the document and calls `AuthorizeAsync(user, document, requirement)`. Ana is the author, Cy is an editor, Bob is neither, so his request is not authorized.',
      },
      {
        key: 'handler-missing',
        code: `using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.Extensions.DependencyInjection;

var services = new ServiceCollection();
services.AddLogging();
services.AddAuthorization();
// EditDocumentHandler is written below but never registered.
var authorization = services.BuildServiceProvider().GetRequiredService<IAuthorizationService>();

var ana = new ClaimsPrincipal(new ClaimsIdentity([new Claim(ClaimTypes.Name, "ana")], "test"));
var draft = new Document("ana");
Console.WriteLine((await authorization.AuthorizeAsync(ana, draft, new EditRequirement())).Succeeded);

record Document(string Author);
class EditRequirement : IAuthorizationRequirement;

class EditDocumentHandler : AuthorizationHandler<EditRequirement, Document>
{
    protected override Task HandleRequirementAsync(AuthorizationHandlerContext context, EditRequirement requirement, Document document)
    {
        if (context.User.Identity?.Name == document.Author) context.Succeed(requirement);
        return Task.CompletedTask;
    }
}`,
        output: 'False',
        why: 'A requirement succeeds only if some handler marks it as succeeded. With no handler registered, nothing does, so even the author is denied. Authorization fails closed, which is safe, but a missing registration shows up as "everyone is forbidden".',
      },
    ],
    'program',
  ),
  ...outputFamily(
    'aspnet-sec-fallback-policy',
    5,
    [
      'The fallback policy applies to endpoints with no authorization metadata; the default policy applies to endpoints that ask for authorization without naming a policy.',
    ],
    [
      {
        key: 'fallback',
        code: web({
          usings: HEADER_AUTH_USINGS,
          services: `${HEADER_AUTH_SERVICES}
builder.Services.AddAuthorization(options =>
    options.FallbackPolicy = new AuthorizationPolicyBuilder().RequireAuthenticatedUser().Build());`,
          app: `app.UseAuthentication();
app.UseAuthorization();
app.MapGet("/orders", () => "orders");
app.MapGet("/health", () => "ok").AllowAnonymous();`,
          client: `${SEND_AS}
Console.WriteLine((int)(await Send("/orders", null)).StatusCode);
Console.WriteLine((int)(await Send("/health", null)).StatusCode);
Console.WriteLine((int)(await Send("/orders", "ana")).StatusCode);`,
          types: HEADER_AUTH_TYPE,
        }),
        output: '401\n200\n200',
        why: 'With a fallback policy, an endpoint nobody remembered to protect (`/orders`) still requires an authenticated user, so the API is secure by default. Public endpoints opt out explicitly with `AllowAnonymous()`.',
      },
      {
        key: 'default-only',
        code: web({
          usings: HEADER_AUTH_USINGS,
          services: `${HEADER_AUTH_SERVICES}
builder.Services.AddAuthorization(options =>
    options.DefaultPolicy = new AuthorizationPolicyBuilder().RequireAuthenticatedUser().RequireRole("staff").Build());`,
          app: `app.UseAuthentication();
app.UseAuthorization();
app.MapGet("/orders", () => "orders");
app.MapGet("/reports", () => "reports").RequireAuthorization();`,
          client: `${SEND_AS}
Console.WriteLine((int)(await Send("/orders", null)).StatusCode);
Console.WriteLine((int)(await Send("/reports", "ana")).StatusCode);`,
          types: HEADER_AUTH_TYPE,
        }),
        output: '200\n403',
        why: 'The default policy is used only where authorization is requested without a policy name (`RequireAuthorization()`, `[Authorize]`). `/orders` has no authorization metadata and there is no fallback policy, so it stays open to anonymous callers. `/reports` uses the default policy, and Ana lacks the staff role: 403.',
      },
    ],
  ),
];
