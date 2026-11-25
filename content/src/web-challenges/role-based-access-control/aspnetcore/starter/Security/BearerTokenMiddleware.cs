namespace ExpenseApi.Security;

/// <summary>
/// Authenticates requests from their <c>Authorization: Bearer &lt;token&gt;</c> header.
/// </summary>
public sealed class BearerTokenMiddleware(RequestDelegate next, IdentityStore identities)
{
    public async Task InvokeAsync(HttpContext context)
    {
        // TODO: every endpoint except GET /api/health requires a valid bearer token.
        // - Read the Authorization header: the scheme "Bearer" (any letter case),
        //   one space, then the token (case-sensitive). Look the token up in `identities`.
        // - Missing header, another scheme, no token or an unknown token:
        //   401 Unauthorized with the header `WWW-Authenticate: Bearer`.
        // - Otherwise remember the user with CurrentUser.Set(context, user).
        _ = identities;
        await next(context);
    }
}
