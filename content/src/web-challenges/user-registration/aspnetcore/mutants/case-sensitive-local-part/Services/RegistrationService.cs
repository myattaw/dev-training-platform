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
    private static readonly object Gate = new();

    public UserAccount? Find(int id) => repository.Find(id);

    public RegisterResult Register(RegisterRequest request)
    {
        var email = request.Email?.Trim().ToLowerInvariant() ?? "";
        var displayName = request.DisplayName?.Trim() ?? "";
        var password = request.Password ?? "";

        var errors = new Dictionary<string, string[]>();
        var emailIsValid = IsEmail(email);
        if (!emailIsValid) errors["email"] = ["Enter an email address like name@example.com."];
        if (displayName.Length is < 2 or > 40)
            errors["displayName"] = ["Display name must be 2-40 characters."];
        var localPart = emailIsValid ? email[..email.IndexOf('@')] : null;
        var passwordErrors = PasswordErrors(password, localPart);
        if (passwordErrors.Count > 0) errors["password"] = [.. passwordErrors];
        if (string.IsNullOrEmpty(request.ConfirmPassword) || request.ConfirmPassword != password)
            errors["confirmPassword"] = ["Passwords do not match."];
        if (request.AcceptTerms != true) errors["acceptTerms"] = ["You must accept the terms."];
        if (errors.Count > 0) return new RegisterResult.Invalid(errors);

        lock (Gate)
        {
            if (repository.FindByEmail(email) is not null) return new RegisterResult.Duplicate();
            return new RegisterResult.Created(
                repository.Add(email, displayName, PasswordHasher.Hash(password)));
        }
    }

    private static List<string> PasswordErrors(string password, string? localPart)
    {
        var errors = new List<string>();
        if (password.Length < 12) errors.Add("Password must be at least 12 characters.");
        if (!password.Any(c => c is >= 'A' and <= 'Z')) errors.Add("Password needs an upper-case letter.");
        if (!password.Any(c => c is >= 'a' and <= 'z')) errors.Add("Password needs a lower-case letter.");
        if (!password.Any(c => c is >= '0' and <= '9')) errors.Add("Password needs a digit.");
        if (localPart is not null && password.Contains(localPart))
            errors.Add("Password must not contain your email address.");
        return errors;
    }

    private static bool IsEmail(string email)
    {
        var at = email.IndexOf('@');
        if (at <= 0 || at != email.LastIndexOf('@') || email.Any(char.IsWhiteSpace)) return false;
        var domain = email[(at + 1)..];
        return domain.Contains('.') && !domain.StartsWith('.') && !domain.EndsWith('.');
    }
}
