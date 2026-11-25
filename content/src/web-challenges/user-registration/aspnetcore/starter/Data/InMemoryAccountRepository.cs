using RegistrationApi.Models;
using RegistrationApi.Security;

namespace RegistrationApi.Data;

/// <summary>
/// In-memory storage, seeded with one account (ada@example.com). Registered as a
/// singleton, so data lives as long as the application. Thread-safe.
/// </summary>
public sealed class InMemoryAccountRepository : IAccountRepository
{
    private readonly object _gate = new();
    private readonly List<UserAccount> _accounts =
    [
        new(1, "ada@example.com", "Ada Lovelace", PasswordHasher.Hash("Analytical-Engine-1843")),
    ];
    private int _nextId = 2;

    public UserAccount? Find(int id)
    {
        lock (_gate) return _accounts.FirstOrDefault(a => a.Id == id);
    }

    public UserAccount? FindByEmail(string email)
    {
        lock (_gate)
        {
            return _accounts.FirstOrDefault(a =>
                string.Equals(a.Email, email, StringComparison.OrdinalIgnoreCase));
        }
    }

    public UserAccount Add(string email, string displayName, string passwordHash)
    {
        lock (_gate)
        {
            var account = new UserAccount(_nextId++, email, displayName, passwordHash);
            _accounts.Add(account);
            return account;
        }
    }
}
