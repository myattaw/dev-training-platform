namespace ExpenseApi.Security;

/// <summary>Stores the authenticated user of the current request in <c>HttpContext.Items</c>.</summary>
public static class CurrentUser
{
    private const string Key = "ExpenseApi.CurrentUser";

    public static void Set(HttpContext context, AppUser user) => context.Items[Key] = user;

    /// <summary>The authenticated user, or null when the request is not authenticated.</summary>
    public static AppUser? Get(HttpContext context) =>
        context.Items.TryGetValue(Key, out var user) ? user as AppUser : null;
}
