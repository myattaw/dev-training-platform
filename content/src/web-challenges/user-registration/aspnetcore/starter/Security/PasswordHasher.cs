using System.Security.Cryptography;

namespace RegistrationApi.Security;

/// <summary>Salted PBKDF2 password hashes. Store the hash, never the password.</summary>
public static class PasswordHasher
{
    private const int Iterations = 10_000;

    public static string Hash(string password)
    {
        var salt = RandomNumberGenerator.GetBytes(16);
        var hash = Rfc2898DeriveBytes.Pbkdf2(password, salt, Iterations, HashAlgorithmName.SHA256, 32);
        return $"pbkdf2-sha256${Iterations}${Convert.ToBase64String(salt)}${Convert.ToBase64String(hash)}";
    }
}
