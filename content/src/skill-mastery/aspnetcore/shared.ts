/**
 * C# fragments shared by several questions.
 *
 * `HeaderAuth` is a tiny test authentication handler: it signs in the user named
 * in the `X-User` header (roles from `X-Roles`, comma-separated), and leaves the
 * request anonymous when the header is missing. It stands in for cookies or JWT
 * bearer tokens, which need packages or keys the runner does not have.
 */
export const HEADER_AUTH_USINGS = [
  'System.Security.Claims',
  'System.Text.Encodings.Web',
  'Microsoft.AspNetCore.Authentication',
  'Microsoft.AspNetCore.Authorization',
  'Microsoft.Extensions.Options',
];

export const HEADER_AUTH_SERVICES = `builder.Services.AddAuthentication("Header")
    .AddScheme<AuthenticationSchemeOptions, HeaderAuth>("Header", null);`;

export const HEADER_AUTH_TYPE = `// Test sign-in: X-User names the user, X-Roles lists roles. No header, no user.
class HeaderAuth(IOptionsMonitor<AuthenticationSchemeOptions> options, ILoggerFactory logger, UrlEncoder encoder)
    : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
{
    protected override Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        var name = Request.Headers["X-User"].ToString();
        if (name == "") return Task.FromResult(AuthenticateResult.NoResult());
        var claims = new List<Claim> { new(ClaimTypes.Name, name) };
        foreach (var role in Request.Headers["X-Roles"].ToString().Split(',', StringSplitOptions.RemoveEmptyEntries))
            claims.Add(new(ClaimTypes.Role, role));
        var user = new ClaimsPrincipal(new ClaimsIdentity(claims, Scheme.Name));
        return Task.FromResult(AuthenticateResult.Success(new AuthenticationTicket(user, Scheme.Name)));
    }
}`;

/** A client-side helper: sends GET `path` as `user` (null = anonymous) with optional roles. */
export const SEND_AS = `async Task<HttpResponseMessage> Send(string path, string? user, string roles = "")
{
    var request = new HttpRequestMessage(HttpMethod.Get, path);
    if (user is not null) request.Headers.Add("X-User", user);
    if (roles != "") request.Headers.Add("X-Roles", roles);
    return await http.SendAsync(request);
}`;
