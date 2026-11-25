package com.pracstack.registration.data;

import com.pracstack.registration.model.UserAccount;
import com.pracstack.registration.security.PasswordHasher;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import org.springframework.stereotype.Repository;

/** In-memory storage, seeded with one account (ada@example.com). Thread-safe. */
@Repository
public class InMemoryAccountRepository implements AccountRepository {
    private final List<UserAccount> accounts = new ArrayList<>(List.of(
            new UserAccount(1, "ada@example.com", "Ada Lovelace", PasswordHasher.hash("Analytical-Engine-1843"))));
    private long nextId = 2;

    @Override
    public synchronized Optional<UserAccount> findById(long id) {
        return accounts.stream().filter(a -> a.id() == id).findFirst();
    }

    @Override
    public synchronized Optional<UserAccount> findByEmail(String email) {
        return accounts.stream().filter(a -> a.email().equalsIgnoreCase(email)).findFirst();
    }

    @Override
    public synchronized UserAccount add(String email, String displayName, String passwordHash) {
        UserAccount account = new UserAccount(nextId++, email, displayName, passwordHash);
        accounts.add(account);
        return account;
    }
}
