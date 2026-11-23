// PracStack test driver (read-only). It hosts your CustomerApi on a loopback port
// inside the sandbox and sends it real HTTP requests; the tests call these methods.
//
// Authentication is simulated: the "Header" scheme below turns the request headers
// X-User-Id (the signed-in user) and X-Roles (comma-separated roles) into
// HttpContext.User. A request without X-User-Id is anonymous. In production this
// would be a JWT bearer or cookie scheme; your endpoints should not care which.
using System.Net;
using System.Security.Claims;
using System.Text.Encodings.Web;
using System.Text.Json;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Hosting.Server;
using Microsoft.AspNetCore.Hosting.Server.Features;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

public sealed class HeaderAuthenticationHandler(
    IOptionsMonitor<AuthenticationSchemeOptions> options, ILoggerFactory logger, UrlEncoder encoder)
    : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
{
    public const string Scheme = "Header";

    protected override Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        var userId = Request.Headers["X-User-Id"].ToString().Trim();
        if (userId.Length == 0) return Task.FromResult(AuthenticateResult.NoResult());
        var claims = new List<Claim> { new(ClaimTypes.NameIdentifier, userId), new(ClaimTypes.Name, userId) };
        foreach (var role in Request.Headers["X-Roles"].ToString().Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
        {
            claims.Add(new Claim(ClaimTypes.Role, role));
        }
        var principal = new ClaimsPrincipal(new ClaimsIdentity(claims, Scheme));
        return Task.FromResult(AuthenticateResult.Success(new AuthenticationTicket(principal, Scheme)));
    }
}

public sealed class CustomerApiClient
{
    private readonly HttpClient _http;

    /// <summary>The app of the previous test; stopped before the next one starts.</summary>
    private static WebApplication? _current;
    private static HttpClient? _currentClient;

    public CustomerApiClient()
    {
        // One app at a time: each test gets a fresh one, and the old one's server,
        // threads and memory are released first.
        if (_current is not null)
        {
            // Close the old client's keep-alive connections first, so shutdown is quick.
            _currentClient?.Dispose();
            using var stop = new CancellationTokenSource(TimeSpan.FromSeconds(1));
            _current.StopAsync(stop.Token).GetAwaiter().GetResult();
            _current.DisposeAsync().AsTask().GetAwaiter().GetResult();
            _current = null;
        }
        var builder = WebApplication.CreateSlimBuilder();
        builder.Logging.ClearProviders();
        builder.WebHost.UseUrls("http://127.0.0.1:0");
        builder.Services
            .AddAuthentication(HeaderAuthenticationHandler.Scheme)
            .AddScheme<AuthenticationSchemeOptions, HeaderAuthenticationHandler>(HeaderAuthenticationHandler.Scheme, null);
        builder.Services.AddAuthorization();
        CustomerApi.ConfigureServices(builder.Services);
        var app = builder.Build();
        app.UseAuthentication();
        app.UseAuthorization();
        CustomerApi.MapEndpoints(app);
        app.StartAsync().GetAwaiter().GetResult();
        _current = app;
        var address = app.Services.GetRequiredService<IServer>()
            .Features.Get<IServerAddressesFeature>()!.Addresses.First();
        _http = new HttpClient { BaseAddress = new Uri(address), Timeout = TimeSpan.FromSeconds(5) };
        _currentClient = _http;
    }

    /// <summary>
    /// Sends a request as `user` ("" for an anonymous request; "support:agent-7" for user
    /// agent-7 with the role support) and returns the status code.
    /// </summary>
    public int Status(string user, string method, string path, string? body) =>
        (int)Send(user, method, path, body).Status;

    /// <summary>
    /// Sends a request and returns a value from the JSON response: a dot path such as
    /// "name", "0.email", "errors.email" or "length" for an array's length. Names match
    /// case-insensitively. Strings are returned without quotes; a missing value is null.
    /// </summary>
    public string? Field(string user, string method, string path, string? body, string field)
    {
        var (_, text) = Send(user, method, path, body);
        try
        {
            using var doc = JsonDocument.Parse(text);
            var current = doc.RootElement;
            foreach (var part in field.Split('.'))
            {
                if (part == "length" && current.ValueKind == JsonValueKind.Array)
                {
                    return current.GetArrayLength().ToString(System.Globalization.CultureInfo.InvariantCulture);
                }
                if (current.ValueKind == JsonValueKind.Array && int.TryParse(part, out var index))
                {
                    if (index >= current.GetArrayLength()) return null;
                    current = current[index];
                }
                else if (current.ValueKind == JsonValueKind.Object && TryGetProperty(current, part, out var next))
                {
                    current = next;
                }
                else
                {
                    return null;
                }
            }
            return current.ValueKind == JsonValueKind.String ? current.GetString() : current.GetRawText();
        }
        catch (JsonException)
        {
            return null;
        }
    }

    /// <summary>Sends a request and tells whether the response body contains `text` (ignoring case).</summary>
    public bool BodyContains(string user, string method, string path, string? body, string text) =>
        Send(user, method, path, body).Body.Contains(text, StringComparison.OrdinalIgnoreCase);

    private static bool TryGetProperty(JsonElement obj, string name, out JsonElement value)
    {
        foreach (var property in obj.EnumerateObject())
        {
            if (string.Equals(property.Name, name, StringComparison.OrdinalIgnoreCase))
            {
                value = property.Value;
                return true;
            }
        }
        value = default;
        return false;
    }

    private (HttpStatusCode Status, string Body) Send(string user, string method, string path, string? body)
    {
        using var request = new HttpRequestMessage(new HttpMethod(method), path);
        if (user.Length > 0)
        {
            var colon = user.IndexOf(':');
            request.Headers.Add("X-User-Id", colon < 0 ? user : user[(colon + 1)..]);
            if (colon > 0) request.Headers.Add("X-Roles", user[..colon]);
        }
        if (body is not null) request.Content = new StringContent(body, System.Text.Encoding.UTF8, "application/json");
        using var response = _http.Send(request);
        return (response.StatusCode, response.Content.ReadAsStringAsync().GetAwaiter().GetResult());
    }
}
