namespace ExpenseApi.Security;

/// <summary>
/// Authenticates requests from their <c>Authorization: Bearer &lt;token&gt;</c> header.
/// Every endpoint except GET /api/health requires a known token: anything else
/// is 401 with <c>WWW-Authenticate: Bearer</c>.
/// </summary>
public sealed class BearerTokenMiddleware(RequestDelegate next, IdentityStore identities)
{
    public async Task InvokeAsync(HttpContext context)
    {
        if (context.Request.Path.StartsWithSegments("/api/health"))
        {
            await next(context);
            return;
        }
        var user = Authenticate(context.Request.Headers.Authorization.ToString());
        if (user is null)
        {
            context.Response.StatusCode = StatusCodes.Status401Unauthorized;
            context.Response.Headers.WWWAuthenticate = "Bearer";
            await context.Response.WriteAsJsonAsync(new { error = "A valid bearer token is required." });
            return;
        }
        CurrentUser.Set(context, user);
        await next(context);
    }

    private AppUser? Authenticate(string header)
    {
        // "<scheme> <token>": the scheme is case-insensitive, the token is not.
        var space = header.IndexOf(' ');
        if (space <= 0) return null;
        var scheme = header[..space];
        var token = header[(space + 1)..].Trim();
        if (!scheme.Equals("Bearer", StringComparison.OrdinalIgnoreCase) || token.Length == 0)
            return null;
        return identities.FindByToken(token);
    }
}
