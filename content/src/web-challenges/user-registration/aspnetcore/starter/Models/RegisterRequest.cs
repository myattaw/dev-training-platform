namespace RegistrationApi.Models;

/// <summary>The JSON body of POST /api/registrations. Any field may be missing (null).</summary>
public record RegisterRequest(
    string? Email,
    string? DisplayName,
    string? Password,
    string? ConfirmPassword,
    bool? AcceptTerms);
