namespace ExpenseApi.Security;

/// <summary>A user of the expense system. Roles: <c>employee</c> or <c>admin</c>.</summary>
public sealed record AppUser(string Username, string Role)
{
    public bool IsAdmin => Role == "admin";
}
