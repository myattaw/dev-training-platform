using RegistrationApi.Models;

namespace RegistrationApi.Data;

/// <summary>Stores accounts. Ids start at 1 and are never reused.</summary>
public interface IAccountRepository
{
    UserAccount? Find(int id);

    /// <summary>Finds an account by email address, ignoring case.</summary>
    UserAccount? FindByEmail(string email);

    /// <summary>Stores a new account with the next id and returns it.</summary>
    UserAccount Add(string email, string displayName, string passwordHash);
}
