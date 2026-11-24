import type { QuestionSource } from '@pracstack/content-model';
import { cs } from '../helpers';
import { choiceFamily, outputFamily, web } from './builders';
import { HEADER_AUTH_SERVICES, HEADER_AUTH_TYPE, HEADER_AUTH_USINGS, SEND_AS } from './shared';

/*
 * The middleware pipeline, dependency injection, configuration, options and
 * logging. Programs run in the real C# runner; HTTP ones host a real app.
 */

// ================================================================ Middleware pipeline

export const middlewareFamilies: readonly QuestionSource[] = [
  ...outputFamily(
    'aspnet-mw-order-trace',
    1,
    [
      'Each middleware runs its code before `next` on the way in, and its code after `next` on the way out.',
    ],
    [
      {
        key: 'one',
        code: web({
          app: `app.Use(async (context, next) =>
{
    Console.WriteLine("before");
    await next(context);
    Console.WriteLine("after");
});
app.MapGet("/", () => { Console.WriteLine("endpoint"); return "hi"; });`,
          client: `await http.GetAsync("/");`,
        }),
        output: 'before\nendpoint\nafter',
        why: 'The middleware prints, then `await next(context)` passes the request on to the endpoint, and only when that completes does the rest of the middleware run. Middleware wraps everything registered after it.',
      },
      {
        key: 'two',
        code: web({
          app: `app.Use(async (context, next) =>
{
    Console.WriteLine("A in");
    await next(context);
    Console.WriteLine("A out");
});
app.Use(async (context, next) =>
{
    Console.WriteLine("B in");
    await next(context);
    Console.WriteLine("B out");
});
app.MapGet("/", () => { Console.WriteLine("endpoint"); return "hi"; });`,
          client: `await http.GetAsync("/");`,
        }),
        output: 'A in\nB in\nendpoint\nB out\nA out',
        why: 'Middleware runs in registration order on the way in (A, then B, then the endpoint) and in reverse order on the way out, like nested function calls: B finishes before A does.',
      },
    ],
  ),
  ...choiceFamily(
    'aspnet-mw-basics',
    1,
    'Picture the pipeline as a chain where each link decides whether to call the next one.',
    [
      {
        key: 'no-next',
        question:
          'A middleware writes a response and returns without calling `next`. What happens to the middleware and endpoint registered after it?',
        correct:
          'They do not run for that request: the pipeline short-circuits and the response goes back through the earlier middleware',
        wrong: [
          'They still run, after the response has been sent',
          'ASP.NET Core throws, because every middleware must call `next`',
          'The endpoint runs, but the later middleware is skipped',
        ],
        why: 'Not calling `next` is how middleware short-circuits (static files, authentication challenges, health checks): nothing after it runs. Middleware registered earlier still finishes its "after" code as the call stack unwinds. It is a normal pattern, not an error.',
      },
      {
        key: 'response-order',
        question:
          'Middleware X is registered before middleware Y. Both add code after `await next(context)`. In which order does that code run?',
        correct: 'Y’s code first, then X’s',
        wrong: [
          'X’s code first, then Y’s',
          'In parallel, because the response is already complete',
          'Only X’s code, because Y was the last to call `next`',
        ],
        why: 'X calls Y (through `next`), so Y must return before X can continue: the "after" parts run in reverse registration order. Thinking of the pipeline as a list processed twice in the same order is the common misconception.',
      },
    ],
  ),
  ...outputFamily(
    'aspnet-mw-short-circuit',
    2,
    ['Follow each request: which middleware returns without calling `next`?'],
    [
      {
        key: 'api-key',
        code: web({
          app: `app.Use(async (context, next) =>
{
    Console.WriteLine("check key");
    if (context.Request.Headers["X-Api-Key"] != "s3cret")
    {
        context.Response.StatusCode = StatusCodes.Status401Unauthorized;
        return;
    }
    await next(context);
});
app.Use(async (context, next) =>
{
    Console.WriteLine("log request");
    await next(context);
});
app.MapGet("/data", () => { Console.WriteLine("endpoint"); return "data"; });`,
          client: `Console.WriteLine((int)(await http.GetAsync("/data")).StatusCode);
var request = new HttpRequestMessage(HttpMethod.Get, "/data");
request.Headers.Add("X-Api-Key", "s3cret");
Console.WriteLine((int)(await http.SendAsync(request)).StatusCode);`,
        }),
        output: 'check key\n401\ncheck key\nlog request\nendpoint\n200',
        why: 'Without the header, the first middleware sets 401 and returns, so neither the logging middleware nor the endpoint runs. With the right key it calls `next`, and the request flows through the rest of the pipeline.',
      },
      {
        key: 'health',
        code: web({
          app: `app.Use(async (context, next) =>
{
    if (context.Request.Path == "/ping")
    {
        await context.Response.WriteAsync("pong");
        return;
    }
    Console.WriteLine("pass through");
    await next(context);
});
app.Use(async (context, next) =>
{
    Console.WriteLine("timing");
    await next(context);
});
app.MapGet("/ping", () => "from endpoint");
app.MapGet("/orders", () => "orders");`,
          client: `Console.WriteLine(await http.GetStringAsync("/ping"));
Console.WriteLine(await http.GetStringAsync("/orders"));`,
        }),
        output: 'pong\npass through\ntiming\norders',
        why: '`/ping` is answered by the first middleware, which never calls `next`, so the timing middleware and the mapped `/ping` endpoint never run. `/orders` passes through both middleware to its endpoint.',
      },
    ],
  ),
  ...outputFamily(
    'aspnet-mw-use-run-map',
    3,
    [
      '`Run` is terminal, `Map` branches by path for good, `UseWhen` branches and rejoins. Endpoints run at the end of the main pipeline.',
    ],
    [
      {
        key: 'run-before-endpoint',
        code: web({
          app: `app.Use(async (context, next) =>
{
    Console.WriteLine("A in");
    await next(context);
    Console.WriteLine("A out");
});
app.Run(async context =>
{
    Console.WriteLine("run");
    await context.Response.WriteAsync("from Run");
});
app.MapGet("/hello", () => "from endpoint");`,
          client: `Console.WriteLine(await http.GetStringAsync("/hello"));`,
        }),
        output: 'A in\nrun\nA out\nfrom Run',
        why: '`Run` adds terminal middleware: it never calls a next delegate. With `WebApplication`, mapped endpoints execute at the end of the pipeline, after all middleware, so the `Run` delegate answers `/hello` and the endpoint is never reached.',
      },
      {
        key: 'map-branch',
        code: web({
          app: `app.Map("/admin", admin =>
{
    admin.Run(async context =>
    {
        Console.WriteLine($"admin branch, path {context.Request.Path}");
        await context.Response.WriteAsync("admin");
    });
});
app.Use(async (context, next) =>
{
    Console.WriteLine("main pipeline");
    await next(context);
});
app.MapGet("/home", () => "home");`,
          client: `await http.GetAsync("/admin/users");
await http.GetAsync("/home");`,
        }),
        output: 'admin branch, path /users\nmain pipeline',
        why: '`Map("/admin", ...)` sends matching requests into a separate branch that never returns to the main pipeline, and it strips the matched prefix from `Request.Path` (it moves to `PathBase`), so the branch sees `/users`. `/home` does not match and continues through the main pipeline.',
      },
      {
        key: 'use-when',
        code: web({
          app: `app.UseWhen(context => context.Request.Path.StartsWithSegments("/api"), api =>
{
    api.Use(async (context, next) =>
    {
        Console.WriteLine("api only");
        await next(context);
    });
});
app.Use(async (context, next) =>
{
    Console.WriteLine("everyone");
    await next(context);
});
app.MapGet("/api/items", () => "items");
app.MapGet("/home", () => "home");`,
          client: `await http.GetAsync("/api/items");
await http.GetAsync("/home");`,
        }),
        output: 'api only\neveryone\neveryone',
        why: '`UseWhen` runs the branch only for matching requests and then rejoins the main pipeline (unless the branch short-circuits), so `/api/items` passes both middleware. `/home` skips the branch. Unlike `Map`, `UseWhen` does not end the pipeline.',
      },
    ],
  ),
  ...choiceFamily(
    'aspnet-mw-recommended-order',
    3,
    'Each middleware can only affect requests and exceptions that pass through it after it in the pipeline.',
    [
      {
        key: 'full-order',
        question: 'Which order of middleware in `Program.cs` is correct for a typical API?',
        code: cs(`using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.DependencyInjection;

var builder = WebApplication.CreateBuilder();
builder.Services.AddCors();
builder.Services.AddAuthentication();
builder.Services.AddAuthorization();
var app = builder.Build();
// Which order should the middleware below be in?`),
        correct:
          '`UseExceptionHandler`, `UseHttpsRedirection`, `UseRouting`, `UseCors`, `UseAuthentication`, `UseAuthorization`, then the endpoints',
        wrong: [
          '`UseRouting`, `UseAuthorization`, `UseAuthentication`, `UseCors`, `UseHttpsRedirection`, `UseExceptionHandler`, then the endpoints',
          '`UseAuthentication`, `UseAuthorization`, `UseRouting`, `UseCors`, `UseHttpsRedirection`, then the endpoints, then `UseExceptionHandler`',
          '`UseHttpsRedirection`, `UseRouting`, `UseAuthorization`, `UseCors`, `UseAuthentication`, `UseExceptionHandler`, then the endpoints',
        ],
        why: 'The exception handler comes first so it wraps everything after it. Routing selects the endpoint before CORS and authorization read its metadata. Authentication must establish the user before authorization decides about it. An exception handler at the end (or after the middleware that throws) cannot catch anything.',
      },
      {
        key: 'status-logging',
        question:
          'A middleware should log the final status code of every request, including requests rejected with 401 or 403 by authentication and authorization. Where should it go, and when should it read the status?',
        correct:
          'Before `UseAuthentication`, reading `Response.StatusCode` after `await next(context)` returns',
        wrong: [
          'After `UseAuthorization`, reading `Response.StatusCode` before calling `next`',
          'Before `UseAuthentication`, reading `Response.StatusCode` before calling `next`',
          'As the last middleware before the endpoints, reading the status after `next`',
        ],
        why: 'Rejected requests short-circuit inside the authorization middleware, so a logger registered after it never sees them. Registered earlier, the logger wraps authentication and authorization, and the status is only final once `next` has returned. Before `next`, the status is still the default 200.',
      },
    ],
  ),
  ...outputFamily(
    'aspnet-mw-exception-placement',
    4,
    [
      'A try/catch in middleware only covers what runs inside its `await next(context)`. And once the response has started, its status line and headers are already sent.',
    ],
    [
      {
        key: 'registered-too-late',
        code: web({
          app: `app.Use(async (context, next) =>
{
    if (context.Request.Path == "/fail") throw new InvalidOperationException("fail");
    await next(context);
});
app.Use(async (context, next) =>
{
    try
    {
        await next(context);
    }
    catch (Exception ex)
    {
        Console.WriteLine($"handled {ex.Message}");
        context.Response.StatusCode = 500;
        await context.Response.WriteAsync("friendly error");
    }
});
app.MapGet("/crash", string () => throw new InvalidOperationException("crash"));
app.MapGet("/fail", () => "never");`,
          client: `foreach (var path in new[] { "/crash", "/fail" })
{
    var res = await http.GetAsync(path);
    Console.WriteLine($"{(int)res.StatusCode} {await res.Content.ReadAsStringAsync()}");
}`,
        }),
        output: 'handled crash\n500 friendly error\n500',
        why: 'The handler catches exceptions thrown inside its `next`, so the endpoint’s exception becomes the friendly response. The first middleware throws before the handler is even reached, so the server’s default 500 with an empty body is sent and nothing is printed. That is why the exception handler is registered first.',
      },
      {
        key: 'response-started',
        code: web({
          app: `app.Use(async (context, next) =>
{
    try
    {
        await next(context);
    }
    catch (Exception)
    {
        if (context.Response.HasStarted)
        {
            Console.WriteLine("too late to change the status");
            return;
        }
        context.Response.StatusCode = 500;
        await context.Response.WriteAsync("error");
    }
});
app.MapGet("/report", async (HttpContext context) =>
{
    await context.Response.WriteAsync("partial report");
    throw new InvalidOperationException("query failed");
});`,
          client: `var res = await http.GetAsync("/report");
Console.WriteLine($"{(int)res.StatusCode} {await res.Content.ReadAsStringAsync()}");`,
        }),
        output: 'too late to change the status\n200 partial report',
        why: 'Writing the first bytes of the body sends the status line and headers, so `Response.HasStarted` is true and the status can no longer become 500. This handler swallows the exception, so the client sees a 200 with a truncated body, which looks like success. Endpoints should do work that can fail before they start writing.',
      },
    ],
  ),
  ...outputFamily(
    'aspnet-mw-auth-order',
    4,
    [
      'Authorization decides about `HttpContext.User`. Which middleware fills in `User`, and has it run yet when authorization runs?',
    ],
    [
      {
        key: 'swapped',
        code: web({
          usings: HEADER_AUTH_USINGS,
          services: `${HEADER_AUTH_SERVICES}
builder.Services.AddAuthorization();`,
          app: `app.UseAuthorization();
app.UseAuthentication();
app.MapGet("/me", (ClaimsPrincipal user) => user.Identity!.Name).RequireAuthorization();`,
          client: `${SEND_AS}
Console.WriteLine((int)(await Send("/me", "ana")).StatusCode);`,
          types: HEADER_AUTH_TYPE,
        }),
        output: '401',
        why: 'Authorization runs first and sees an anonymous `User`, because the authentication middleware that would sign in "ana" from the header has not run yet. The endpoint requires an authenticated user, so the request is challenged with 401 even though valid credentials were sent. `UseAuthentication` must come before `UseAuthorization`.',
      },
      {
        key: 'correct',
        code: web({
          usings: HEADER_AUTH_USINGS,
          services: `${HEADER_AUTH_SERVICES}
builder.Services.AddAuthorization();`,
          app: `app.UseAuthentication();
app.UseAuthorization();
app.MapGet("/me", (ClaimsPrincipal user) => user.Identity!.Name).RequireAuthorization();`,
          client: `${SEND_AS}
var res = await Send("/me", "ana");
Console.WriteLine($"{(int)res.StatusCode} {await res.Content.ReadAsStringAsync()}");
Console.WriteLine((int)(await Send("/me", null)).StatusCode);`,
          types: HEADER_AUTH_TYPE,
        }),
        output: '200 ana\n401',
        why: 'Authentication runs first and turns the header into `HttpContext.User`, so authorization sees an authenticated "ana" and lets the request through. Without the header the user stays anonymous and the endpoint’s requirement produces a 401 challenge.',
      },
    ],
  ),
  ...outputFamily(
    'aspnet-mw-scoped-dependency',
    5,
    [
      'Convention-based middleware is created once, when the pipeline is built. When are its constructor parameters resolved, and from which scope?',
    ],
    [
      {
        key: 'constructor',
        code: web({
          services: 'builder.Services.AddScoped<RequestId>();',
          app: `app.UseMiddleware<StampMiddleware>();
app.MapGet("/", (RequestId id) => id.Value.ToString());`,
          client: `var first = await http.GetAsync("/");
var second = await http.GetAsync("/");
string Stamp(HttpResponseMessage r) => r.Headers.GetValues("X-Request-Id").First();
Console.WriteLine(Stamp(first) == Stamp(second));
Console.WriteLine(Stamp(first) == await first.Content.ReadAsStringAsync());`,
          types: `class RequestId { public Guid Value { get; } = Guid.NewGuid(); }

class StampMiddleware(RequestDelegate next, RequestId id)
{
    public Task InvokeAsync(HttpContext context)
    {
        context.Response.Headers["X-Request-Id"] = id.Value.ToString();
        return next(context);
    }
}`,
        }),
        output: 'True\nFalse',
        why: 'The middleware instance is built once for the app, so its constructor `RequestId` is resolved once (from the root provider: in Production, scope validation is off, so this is not caught) and reused by every request: both headers match. The endpoint gets the real per-request `RequestId`, which differs. Scoped services belong in `InvokeAsync` parameters.',
      },
      {
        key: 'invoke-parameter',
        code: web({
          services: 'builder.Services.AddScoped<RequestId>();',
          app: `app.UseMiddleware<StampMiddleware>();
app.MapGet("/", (RequestId id) => id.Value.ToString());`,
          client: `var first = await http.GetAsync("/");
var second = await http.GetAsync("/");
string Stamp(HttpResponseMessage r) => r.Headers.GetValues("X-Request-Id").First();
Console.WriteLine(Stamp(first) == Stamp(second));
Console.WriteLine(Stamp(first) == await first.Content.ReadAsStringAsync());`,
          types: `class RequestId { public Guid Value { get; } = Guid.NewGuid(); }

class StampMiddleware(RequestDelegate next)
{
    public Task InvokeAsync(HttpContext context, RequestId id)
    {
        context.Response.Headers["X-Request-Id"] = id.Value.ToString();
        return next(context);
    }
}`,
        }),
        output: 'False\nTrue',
        why: 'Extra `InvokeAsync` parameters are resolved from the request’s scope on every call. Each request gets its own `RequestId`, and within one request the middleware and the endpoint share the same scoped instance.',
      },
    ],
  ),
  ...outputFamily(
    'aspnet-mw-routing-position',
    5,
    [
      '`HttpContext.GetEndpoint()` is set by the routing middleware. Where does `WebApplication` put routing if you do not call `UseRouting` yourself?',
    ],
    [
      {
        key: 'explicit-use-routing',
        code: web({
          app: `app.Use(async (context, next) =>
{
    Console.WriteLine($"first: {context.GetEndpoint()?.DisplayName ?? "none"}");
    await next(context);
});
app.UseRouting();
app.Use(async (context, next) =>
{
    Console.WriteLine($"second: {context.GetEndpoint()?.DisplayName ?? "none"}");
    await next(context);
});
app.MapGet("/orders", () => "orders").WithDisplayName("list orders");`,
          client: `await http.GetAsync("/orders");`,
        }),
        output: 'first: none\nsecond: list orders',
        why: 'Calling `UseRouting()` explicitly puts endpoint selection at that point in the pipeline. Middleware before it runs before an endpoint is chosen, so `GetEndpoint()` is null; middleware after it can read the selected endpoint and its metadata (this is why authorization goes after routing).',
      },
      {
        key: 'implicit-routing',
        code: web({
          app: `app.Use(async (context, next) =>
{
    Console.WriteLine($"first: {context.GetEndpoint()?.DisplayName ?? "none"}");
    await next(context);
});
app.MapGet("/orders", () => "orders").WithDisplayName("list orders");`,
          client: `await http.GetAsync("/orders");`,
        }),
        output: 'first: list orders',
        why: 'When endpoints are mapped and you do not call `UseRouting()`, `WebApplication` adds routing at the very start of the pipeline, so even the first middleware already sees the selected endpoint. Calling `UseRouting()` yourself moves it to where you call it.',
      },
    ],
  ),
];

// ================================================================ DI, configuration, options, logging

const lineLogger = `class LineProvider : ILoggerProvider
{
    public ILogger CreateLogger(string category) => new LineLogger(category);
    public void Dispose() { }
}

class LineLogger(string category) : ILogger
{
    public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;
    public bool IsEnabled(LogLevel level) => true;
    public void Log<TState>(LogLevel level, EventId id, TState state, Exception? error,
        Func<TState, Exception?, string> format) =>
        Console.WriteLine($"{level} {category}: {format(state, error)}");
}`;

export const diConfigFamilies: readonly QuestionSource[] = [
  ...choiceFamily(
    'aspnet-di-lifetime-choice',
    1,
    'Singleton: one for the app. Scoped: one per request. Transient: a new one every time it is resolved.',
    [
      {
        key: 'unit-of-work',
        question:
          'A service tracks the changes made while handling one HTTP request and saves them together at the end of that request. Which lifetime fits?',
        correct: 'Scoped',
        wrong: ['Singleton', 'Transient', 'Static field on the controller'],
        why: 'In ASP.NET Core each request gets its own scope, so a scoped service is shared by everything handling that request and is disposed when it ends. A singleton would mix changes from concurrent requests; a transient would give each consumer its own separate set of changes.',
      },
      {
        key: 'shared-cache',
        question:
          'A thread-safe in-memory cache of exchange rates should be shared by all requests and refreshed every hour. Which lifetime fits?',
        correct: 'Singleton',
        wrong: ['Scoped', 'Transient', 'A new instance created in each endpoint with `new`'],
        why: 'A cache only helps if everyone shares it, so it lives as long as the app: singleton. Scoped or transient instances would start empty for every request, refetching the rates each time.',
      },
      {
        key: 'current-tenant',
        question:
          'Middleware reads the tenant id from each request and stores it in a `TenantContext` that repositories use later in the same request. Which lifetime must `TenantContext` have?',
        correct: 'Scoped',
        wrong: ['Singleton', 'Transient', 'Any lifetime works the same here'],
        why: 'The value belongs to one request and must be the same object for the middleware and the repositories within it: scoped. A singleton would leak one tenant’s id into another request (a data isolation bug); a transient would hand the repositories a fresh, empty instance.',
      },
    ],
  ),
  ...outputFamily(
    'aspnet-di-lifetimes-live',
    2,
    [
      'Within one request, a scoped service is resolved once; a transient is new each time; a singleton is shared across requests.',
    ],
    [
      {
        key: 'three-lifetimes',
        code: web({
          services: `builder.Services.AddScoped<RequestId>();
builder.Services.AddSingleton<Counter>();
builder.Services.AddTransient<Stamp>();`,
          app: `app.MapGet("/", (RequestId a, RequestId b, Counter counter, Stamp s1, Stamp s2) =>
    $"{a.Id == b.Id} {counter.Next()} {s1.Id == s2.Id}");`,
          client: `Console.WriteLine(await http.GetStringAsync("/"));
Console.WriteLine(await http.GetStringAsync("/"));`,
          types: `class RequestId { public Guid Id { get; } = Guid.NewGuid(); }
class Stamp { public Guid Id { get; } = Guid.NewGuid(); }
class Counter { private int n; public int Next() => ++n; }`,
        }),
        output: 'True 1 False\nTrue 2 False',
        why: 'Both `RequestId` parameters get the same scoped instance within a request. The singleton `Counter` survives between requests, so it counts 1 then 2. Each `Stamp` is a new transient instance.',
      },
      {
        key: 'scoped-counter',
        code: web({
          services: `builder.Services.AddScoped<Counter>();`,
          app: `app.MapGet("/", (Counter first, Counter second) =>
{
    first.Next();
    return second.Next();
});`,
          client: `Console.WriteLine(await http.GetStringAsync("/"));
Console.WriteLine(await http.GetStringAsync("/"));`,
          types: `class Counter { private int n; public int Next() => ++n; }`,
        }),
        output: '2\n2',
        why: '`first` and `second` are the same scoped instance, so the second `Next()` returns 2. The next request has a new scope and a new `Counter`, so it also prints 2 rather than 4.',
      },
    ],
  ),
  ...outputFamily(
    'aspnet-di-config-precedence',
    2,
    [
      'Configuration sources are read in the order they are added; a later source overrides keys from earlier ones.',
    ],
    [
      {
        key: 'later-wins',
        code: `using Microsoft.Extensions.Configuration;

var config = new ConfigurationBuilder()
    .AddInMemoryCollection(new Dictionary<string, string?>
    {
        ["Smtp:Host"] = "localhost",
        ["Smtp:Port"] = "25",
    })
    .AddInMemoryCollection(new Dictionary<string, string?>
    {
        ["Smtp:Port"] = "587",
    })
    .Build();

Console.WriteLine($"{config["Smtp:Host"]}:{config["Smtp:Port"]}");`,
        output: 'localhost:587',
        why: 'Keys are merged across sources. `Smtp:Port` is set by both, and the source added last wins; `Smtp:Host` only exists in the first source, so it is kept. This is how `appsettings.Production.json` overrides `appsettings.json`.',
      },
      {
        key: 'environment-variables',
        code: `using Microsoft.Extensions.Configuration;

Environment.SetEnvironmentVariable("Smtp__Port", "2525");
var config = new ConfigurationBuilder()
    .AddInMemoryCollection(new Dictionary<string, string?>
    {
        ["Smtp:Host"] = "mail.internal",
        ["Smtp:Port"] = "25",
    })
    .AddEnvironmentVariables()
    .AddCommandLine(["--Smtp:Host=cli.internal"])
    .Build();

Console.WriteLine($"{config["Smtp:Host"]}:{config["Smtp:Port"]}");`,
        output: 'cli.internal:2525',
        why: 'In environment variable names, a double underscore stands for the `:` separator, so `Smtp__Port` overrides `Smtp:Port`. The command line is added last and overrides the host. The default host builder uses the same order: JSON files, then environment variables, then the command line.',
      },
      {
        key: 'order-reversed',
        code: `using Microsoft.Extensions.Configuration;

Environment.SetEnvironmentVariable("Smtp__Port", "2525");
var config = new ConfigurationBuilder()
    .AddEnvironmentVariables()
    .AddInMemoryCollection(new Dictionary<string, string?> { ["Smtp:Port"] = "25" })
    .Build();

Console.WriteLine(config["Smtp:Port"]);`,
        output: '25',
        why: 'Nothing makes environment variables special; only order matters. Here they are added first and the in-memory source added after them overrides `Smtp:Port`.',
      },
    ],
    'program',
  ),
  ...outputFamily(
    'aspnet-di-options-binding',
    3,
    [
      'Binding copies matching keys onto the options object; every `Configure` step runs in registration order when the options are first created.',
    ],
    [
      {
        key: 'defaults-kept',
        code: `using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;

var config = new ConfigurationBuilder()
    .AddInMemoryCollection(new Dictionary<string, string?>
    {
        ["Retry:Attempts"] = "5",
        ["Retry:Unknown"] = "ignored",
    })
    .Build();

var services = new ServiceCollection();
services.Configure<RetryOptions>(config.GetSection("Retry"));
var options = services.BuildServiceProvider().GetRequiredService<IOptions<RetryOptions>>().Value;
Console.WriteLine($"{options.Attempts} {options.DelayMs} {options.Jitter}");

class RetryOptions
{
    public int Attempts { get; set; } = 3;
    public int DelayMs { get; set; } = 200;
    public bool Jitter { get; set; } = true;
}`,
        output: '5 200 True',
        why: '`Attempts` is bound from configuration. `DelayMs` and `Jitter` have no keys, so they keep their property initializers instead of being reset to 0 and false. Keys with no matching property (`Unknown`) are ignored silently, which is how typos in settings go unnoticed.',
      },
      {
        key: 'configure-after-bind',
        code: `using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;

var config = new ConfigurationBuilder()
    .AddInMemoryCollection(new Dictionary<string, string?> { ["Smtp:Port"] = "587" })
    .Build();

var services = new ServiceCollection();
services.Configure<SmtpOptions>(o => o.Port = 2525);
services.Configure<SmtpOptions>(config.GetSection("Smtp"));
services.PostConfigure<SmtpOptions>(o => o.Port += 1);
services.Configure<SmtpOptions>(o => o.Port *= 10);

var options = services.BuildServiceProvider().GetRequiredService<IOptions<SmtpOptions>>().Value;
Console.WriteLine(options.Port);

class SmtpOptions { public int Port { get; set; } }`,
        output: '5871',
        why: 'All `Configure` steps run first, in registration order: 2525, then the binding sets 587, then `*= 10` gives 5870. `PostConfigure` steps always run after every `Configure`, whatever their position, so `+= 1` gives 5871.',
      },
      {
        key: 'bad-value',
        code: `using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;

var config = new ConfigurationBuilder()
    .AddInMemoryCollection(new Dictionary<string, string?> { ["Smtp:Port"] = "five-eight-seven" })
    .Build();

var services = new ServiceCollection();
services.Configure<SmtpOptions>(config.GetSection("Smtp"));
var provider = services.BuildServiceProvider();
Console.WriteLine("provider built");
try
{
    Console.WriteLine(provider.GetRequiredService<IOptions<SmtpOptions>>().Value.Port);
}
catch (InvalidOperationException)
{
    Console.WriteLine("binding failed");
}

class SmtpOptions { public int Port { get; set; } }`,
        output: 'provider built\nbinding failed',
        why: 'Options are created lazily, the first time `.Value` is read, so building the provider succeeds. Then the binder cannot convert "five-eight-seven" to `int` and throws `InvalidOperationException`. In an app this would surface on the first request that needs the options, unless they are validated at startup.',
      },
    ],
    'program',
  ),
  ...outputFamily(
    'aspnet-di-registrations',
    3,
    [
      'Resolving one service returns the last registration; resolving `IEnumerable<T>` returns all of them. `TryAdd*` only adds when nothing is registered yet.',
    ],
    [
      {
        key: 'last-wins',
        code: `using Microsoft.Extensions.DependencyInjection;

var services = new ServiceCollection();
services.AddSingleton<INotifier, EmailNotifier>();
services.AddSingleton<INotifier, SmsNotifier>();
var provider = services.BuildServiceProvider();

Console.WriteLine(provider.GetRequiredService<INotifier>().Name);
Console.WriteLine(string.Join(",", provider.GetServices<INotifier>().Select(n => n.Name)));

interface INotifier { string Name { get; } }
class EmailNotifier : INotifier { public string Name => "email"; }
class SmsNotifier : INotifier { public string Name => "sms"; }`,
        output: 'sms\nemail,sms',
        why: 'Registering a second implementation does not replace the first: single resolution picks the last one registered, and `GetServices` (or an `IEnumerable<INotifier>` constructor parameter) returns all of them in registration order.',
      },
      {
        key: 'try-add',
        code: `using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

var services = new ServiceCollection();
services.AddSingleton<INotifier, EmailNotifier>();
services.TryAddSingleton<INotifier, SmsNotifier>();
var provider = services.BuildServiceProvider();

Console.WriteLine(provider.GetRequiredService<INotifier>().Name);
Console.WriteLine(provider.GetServices<INotifier>().Count());

interface INotifier { string Name { get; } }
class EmailNotifier : INotifier { public string Name => "email"; }
class SmsNotifier : INotifier { public string Name => "sms"; }`,
        output: 'email\n1',
        why: '`TryAddSingleton` does nothing because `INotifier` is already registered. Libraries use `TryAdd*` for defaults so that an application’s own registration wins regardless of order.',
      },
      {
        key: 'replace',
        code: `using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

var services = new ServiceCollection();
services.AddSingleton<INotifier, EmailNotifier>();
services.Replace(ServiceDescriptor.Singleton<INotifier, FakeNotifier>());
var provider = services.BuildServiceProvider();

Console.WriteLine(provider.GetRequiredService<INotifier>().Name);
Console.WriteLine(provider.GetServices<INotifier>().Count());

interface INotifier { string Name { get; } }
class EmailNotifier : INotifier { public string Name => "email"; }
class FakeNotifier : INotifier { public string Name => "fake"; }`,
        output: 'fake\n1',
        why: '`Replace` removes the first registration of the service type and adds the new one, so only the fake remains. Integration tests use this to swap a real dependency for a test double.',
      },
    ],
    'program',
  ),
  ...choiceFamily(
    'aspnet-di-structured-logging',
    3,
    'A log message template keeps its placeholders as named properties that log stores can query.',
    [
      {
        key: 'template',
        question:
          'Logs go to a store that indexes structured properties. Which call lets you later query all entries for a given `OrderId`?',
        code: cs(`using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;

ILogger logger = NullLogger.Instance;
var order = new Order(42, 99.50m);
// Which logging call should go here?

record Order(int Id, decimal Total);`),
        correct: '`logger.LogInformation("Order {OrderId} paid {Total}", order.Id, order.Total);`',
        wrong: [
          '`logger.LogInformation($"Order {order.Id} paid {order.Total}");`',
          '`logger.LogInformation("Order " + order.Id + " paid " + order.Total);`',
          '`logger.LogInformation(string.Format("Order {0} paid {1}", order.Id, order.Total));`',
        ],
        why: 'With a message template the logger receives the template and the values separately, so `OrderId` and `Total` become queryable properties, and formatting is skipped if the level is disabled. Interpolation, concatenation and `string.Format` all produce a finished string first: the values survive only as text.',
      },
      {
        key: 'sensitive',
        question:
          'A login endpoint needs a log entry for failed attempts. Which call is appropriate?',
        code: cs(`using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;

ILogger logger = NullLogger.Instance;
var login = new Login("ana@example.com", "hunter2");
// Which logging call should go here?

record Login(string Email, string Password);`),
        correct: '`logger.LogWarning("Failed login for {Email}", login.Email);`',
        wrong: [
          '`logger.LogWarning("Failed login {@Login}", login);`',
          '`logger.LogWarning("Failed login for {Email} with {Password}", login.Email, login.Password);`',
          '`logger.LogError("Failed login: " + login);`',
        ],
        why: 'Only the email is logged, as a structured property. Logging the whole `Login` object or the password writes a secret into log storage, which is usually far less protected than the user database; a record’s `ToString()` includes every property, password included.',
      },
    ],
  ),
  ...outputFamily(
    'aspnet-di-options-validation',
    4,
    [
      'Options validation runs when the options object is first created, unless validation is requested at startup.',
    ],
    [
      {
        key: 'lazy',
        code: `using System.ComponentModel.DataAnnotations;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;

var config = new ConfigurationBuilder()
    .AddInMemoryCollection(new Dictionary<string, string?> { ["Smtp:Port"] = "70000" })
    .Build();

var services = new ServiceCollection();
services.AddOptions<SmtpOptions>().Bind(config.GetSection("Smtp")).ValidateDataAnnotations();
var provider = services.BuildServiceProvider();
Console.WriteLine("provider built");
try
{
    Console.WriteLine(provider.GetRequiredService<IOptions<SmtpOptions>>().Value.Port);
}
catch (OptionsValidationException ex)
{
    Console.WriteLine(ex.Failures.Count());
}

class SmtpOptions
{
    [Required] public string? Host { get; set; }
    [Range(1, 65535)] public int Port { get; set; }
}`,
        output: 'provider built\n2',
        why: 'Validation is attached to the options, but nothing runs until `.Value` is read; then both annotations fail (no `Host`, and 70000 is out of range) and `OptionsValidationException` lists both failures. Without startup validation, a bad setting is found by the first request that needs it.',
      },
      {
        key: 'on-start',
        code: web({
          usings: ['Microsoft.Extensions.Options'],
          services: `builder.Services.AddOptions<SmtpOptions>()
    .Configure(o => o.Port = 0)
    .Validate(o => o.Port > 0, "Smtp:Port must be positive")
    .ValidateOnStart();`,
          app: `Console.WriteLine("built");
try
{
    await app.StartAsync();
    Console.WriteLine("started");
}
catch (OptionsValidationException ex)
{
    Console.WriteLine(ex.Message);
    return;
}`,
          client: `Console.WriteLine("serving");`,
          types: `class SmtpOptions { public int Port { get; set; } }`,
        }).replace('\nawait app.StartAsync();\n', '\n'),
        output: 'built\nSmtp:Port must be positive',
        why: '`ValidateOnStart()` makes the host validate these options while starting, so `StartAsync` fails immediately with the validation message instead of the app starting and failing later on a request. Building the app does not validate; starting it does.',
      },
    ],
    'web',
  ),
  ...outputFamily(
    'aspnet-di-log-filtering',
    4,
    [
      'A filter for a category applies to every category that starts with it; the most specific rule wins, otherwise the minimum level applies.',
    ],
    [
      {
        key: 'category-filter',
        code: `using Microsoft.Extensions.Logging;

using var factory = LoggerFactory.Create(logging =>
{
    logging.SetMinimumLevel(LogLevel.Warning);
    logging.AddFilter("Payments", LogLevel.Debug);
    logging.AddProvider(new LineProvider());
});

var orders = factory.CreateLogger("Orders.Api");
var payments = factory.CreateLogger("Payments.Gateway");
orders.LogInformation("order placed");
orders.LogError("order failed");
payments.LogDebug("calling gateway");
payments.LogTrace("raw response");

${lineLogger}`,
        output: 'Error Orders.Api: order failed\nDebug Payments.Gateway: calling gateway',
        why: '`Orders.Api` has no specific rule, so the minimum level `Warning` applies: Information is dropped, Error is kept. The `Payments` rule matches `Payments.Gateway` by prefix and lowers its level to Debug, but Trace is below Debug and is dropped.',
      },
      {
        key: 'from-configuration',
        code: `using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

var config = new ConfigurationBuilder()
    .AddInMemoryCollection(new Dictionary<string, string?>
    {
        ["Logging:LogLevel:Default"] = "Information",
        ["Logging:LogLevel:Microsoft.AspNetCore"] = "Warning",
    })
    .Build();

using var factory = LoggerFactory.Create(logging =>
{
    logging.AddConfiguration(config.GetSection("Logging"));
    logging.AddProvider(new LineProvider());
});

factory.CreateLogger("Microsoft.AspNetCore.Routing").LogInformation("matched endpoint");
factory.CreateLogger("Microsoft.AspNetCore.Server").LogWarning("slow request");
factory.CreateLogger("Shop.Orders").LogInformation("order placed");
factory.CreateLogger("Shop.Orders").LogDebug("cart details");

${lineLogger}`,
        output:
          'Warning Microsoft.AspNetCore.Server: slow request\nInformation Shop.Orders: order placed',
        why: 'This is the shape of the `Logging` section in `appsettings.json`. Framework categories under `Microsoft.AspNetCore` are raised to Warning, which hides the noisy Information entries but keeps warnings. Everything else uses `Default` (Information), so `Shop.Orders` logs Information but not Debug.',
      },
    ],
    'program',
  ),
  ...outputFamily(
    'aspnet-di-captive-dependency',
    5,
    [
      'A singleton lives for the whole app. What happens to a scoped service it receives in its constructor?',
    ],
    [
      {
        key: 'unvalidated',
        code: `using Microsoft.Extensions.DependencyInjection;

var services = new ServiceCollection();
services.AddScoped<OrderDb>();
services.AddSingleton<PriceCache>();
var provider = services.BuildServiceProvider();

using var scope1 = provider.CreateScope();
using var scope2 = provider.CreateScope();
var cache1 = scope1.ServiceProvider.GetRequiredService<PriceCache>();
var cache2 = scope2.ServiceProvider.GetRequiredService<PriceCache>();
Console.WriteLine(ReferenceEquals(cache1.Db, cache2.Db));
Console.WriteLine(ReferenceEquals(cache1.Db, scope1.ServiceProvider.GetRequiredService<OrderDb>()));

class OrderDb { }
class PriceCache(OrderDb db) { public OrderDb Db => db; }`,
        output: 'True\nFalse',
        why: 'The singleton is created once, and the `OrderDb` it was given is captured for the app’s lifetime: both "requests" share it, while each scope’s real `OrderDb` is a different instance. This captive dependency defeats the scoped lifetime (for a `DbContext`: one non-thread-safe context shared across requests).',
      },
      {
        key: 'validated',
        code: `using Microsoft.Extensions.DependencyInjection;

var services = new ServiceCollection();
services.AddScoped<OrderDb>();
services.AddSingleton<PriceCache>();
var provider = services.BuildServiceProvider(new ServiceProviderOptions { ValidateScopes = true });

try
{
    using var scope = provider.CreateScope();
    scope.ServiceProvider.GetRequiredService<PriceCache>();
    Console.WriteLine("resolved");
}
catch (InvalidOperationException ex)
{
    Console.WriteLine(ex.Message);
}

class OrderDb { }
class PriceCache(OrderDb db) { public OrderDb Db => db; }`,
        output: "Cannot consume scoped service 'OrderDb' from singleton 'PriceCache'.",
        why: 'With `ValidateScopes`, the container refuses to inject a scoped service into a singleton and names both, turning a subtle runtime bug into an immediate error. Fixes: make `PriceCache` scoped, or inject `IServiceScopeFactory` and create a scope per operation.',
      },
      {
        key: 'environment',
        code: `using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

foreach (var environment in new[] { "Production", "Development" })
{
    var builder = WebApplication.CreateSlimBuilder(new WebApplicationOptions { EnvironmentName = environment });
    builder.Logging.ClearProviders();
    builder.Services.AddScoped<OrderDb>();
    builder.Services.AddSingleton<PriceCache>();
    try
    {
        builder.Build();
        Console.WriteLine($"{environment}: built");
    }
    catch (AggregateException)
    {
        Console.WriteLine($"{environment}: rejected");
    }
}

class OrderDb { }
class PriceCache(OrderDb db) { public OrderDb Db => db; }`,
        output: 'Production: built\nDevelopment: rejected',
        why: 'The web host turns on `ValidateScopes` and `ValidateOnBuild` only in the Development environment, so the captive dependency is rejected while building there but builds silently in Production. Run and test in Development to catch it; do not rely on Production to complain.',
      },
    ],
    'program',
  ),
  ...outputFamily(
    'aspnet-di-options-interfaces',
    5,
    [
      '`IOptions<T>` is computed once; `IOptionsSnapshot<T>` is scoped and recomputed per scope; `IOptionsMonitor<T>` is a singleton that follows configuration reloads.',
    ],
    [
      {
        key: 'monitor-reload',
        code: `using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;

var config = new ConfigurationBuilder()
    .AddInMemoryCollection(new Dictionary<string, string?> { ["Feature:Limit"] = "10" })
    .Build();
var services = new ServiceCollection();
services.Configure<FeatureOptions>(config.GetSection("Feature"));
var provider = services.BuildServiceProvider();

var options = provider.GetRequiredService<IOptions<FeatureOptions>>();
var monitor = provider.GetRequiredService<IOptionsMonitor<FeatureOptions>>();
Console.WriteLine($"{options.Value.Limit} {monitor.CurrentValue.Limit}");

config["Feature:Limit"] = "20";
config.Reload();
Console.WriteLine($"{options.Value.Limit} {monitor.CurrentValue.Limit}");

class FeatureOptions { public int Limit { get; set; } }`,
        output: '10 10\n10 20',
        why: '`IOptions<T>.Value` is created once and cached for the app’s life, so it keeps 10. `IOptionsMonitor<T>` listens for the configuration reload and rebuilds the options, so `CurrentValue` becomes 20. Use the monitor in singletons that must see changed settings.',
      },
      {
        key: 'snapshot-in-singleton',
        code: `using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;

var services = new ServiceCollection();
services.Configure<FeatureOptions>(o => o.Limit = 10);
services.AddSingleton<RateLimiter>();
var provider = services.BuildServiceProvider(new ServiceProviderOptions { ValidateScopes = true });

try
{
    using var scope = provider.CreateScope();
    Console.WriteLine(scope.ServiceProvider.GetRequiredService<RateLimiter>().Limit);
}
catch (InvalidOperationException)
{
    Console.WriteLine("rejected");
}

class FeatureOptions { public int Limit { get; set; } }
class RateLimiter(IOptionsSnapshot<FeatureOptions> options) { public int Limit => options.Value.Limit; }`,
        output: 'rejected',
        why: '`IOptionsSnapshot<T>` is registered as scoped (it is recomputed per request), so a singleton taking it in its constructor is a captive dependency, and scope validation rejects it. A singleton that needs current values should use `IOptionsMonitor<T>`.',
      },
    ],
    'program',
  ),
];
