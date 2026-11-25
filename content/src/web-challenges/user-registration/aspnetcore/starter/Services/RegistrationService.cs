using RegistrationApi.Data;
using RegistrationApi.Models;
using RegistrationApi.Security;

namespace RegistrationApi.Services;

/// <summary>The outcome of a registration.</summary>
public abstract record RegisterResult
{
    public sealed record Created(UserAccount Account) : RegisterResult;

    /// <summary>Invalid input: field name (email, displayName, password, confirmPassword, acceptTerms) → messages.</summary>
    public sealed record Invalid(IDictionary<string, string[]> Errors) : RegisterResult;

    /// <summary>An account with this email address already exists.</summary>
    public sealed record Duplicate : RegisterResult;
}

/// <summary>Registration rules.</summary>
public class RegistrationService(IAccountRepository repository)
{
    public UserAccount? Find(int id) => repository.Find(id);

    public RegisterResult Register(RegisterRequest request)
    {
        // TODO: normalize the input (trim the email and display name, lower-case the email),
        // check every rule and collect an error for each invalid field,
        // reject an email that is already registered (ignoring case),
        // then store the account with PasswordHasher.Hash(password), never the password itself.
        throw new NotImplementedException();
    }
}
