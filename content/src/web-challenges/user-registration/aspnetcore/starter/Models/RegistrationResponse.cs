namespace RegistrationApi.Models;

/// <summary>What the API returns for an account: never the password or its hash.</summary>
public record RegistrationResponse(int Id, string Email, string DisplayName)
{
    public static RegistrationResponse From(UserAccount account) =>
        new(account.Id, account.Email, account.DisplayName);
}
