namespace ExpenseApi.Security;

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
            // Wrong: a header that is present but invalid is treated as "forbidden".
            context.Response.StatusCode = context.Request.Headers.ContainsKey("Authorization")
                ? StatusCodes.Status403Forbidden
                : StatusCodes.Status401Unauthorized;
            context.Response.Headers.WWWAuthenticate = "Bearer";
            await context.Response.WriteAsJsonAsync(new { error = "A valid bearer token is required." });
            return;
        }
        CurrentUser.Set(context, user);
        await next(context);
    }

    private AppUser? Authenticate(string header)
    {
        var space = header.IndexOf(' ');
        if (space <= 0) return null;
        var scheme = header[..space];
        var token = header[(space + 1)..].Trim();
        if (!scheme.Equals("Bearer", StringComparison.OrdinalIgnoreCase) || token.Length == 0)
            return null;
        return identities.FindByToken(token);
    }
}
