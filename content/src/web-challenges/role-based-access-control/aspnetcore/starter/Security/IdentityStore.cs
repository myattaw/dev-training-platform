namespace ExpenseApi.Security;

/// <summary>
/// Test identities for the sandbox: fixed bearer tokens mapped to users. There
/// is no real identity provider and there are no real credentials. Tokens are
/// case-sensitive.
/// </summary>
public sealed class IdentityStore
{
    private readonly Dictionary<string, AppUser> _byToken = new(StringComparer.Ordinal)
    {
        ["test-token-alice"] = new("alice", "employee"),
        ["test-token-bob"] = new("bob", "employee"),
        ["test-token-admin"] = new("admin", "admin"),
    };

    /// <summary>The user a token belongs to, or null for an unknown token.</summary>
    public AppUser? FindByToken(string token) => _byToken.GetValueOrDefault(token);
}
