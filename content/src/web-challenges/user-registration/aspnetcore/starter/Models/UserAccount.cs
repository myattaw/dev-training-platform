namespace RegistrationApi.Models;

/// <summary>
/// A stored account. Only a salted hash of the password is kept, and this type
/// is never returned by the API (see RegistrationResponse).
/// </summary>
public record UserAccount(int Id, string Email, string DisplayName, string PasswordHash);
