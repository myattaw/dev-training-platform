package com.pracstack.registration.data;

import com.pracstack.registration.model.UserAccount;
import java.util.Optional;

/** Stores accounts. Ids start at 1 and are never reused. */
public interface AccountRepository {
    Optional<UserAccount> findById(long id);

    /** Finds an account by email address, ignoring case. */
    Optional<UserAccount> findByEmail(String email);

    /** Stores a new account with the next id and returns it. */
    UserAccount add(String email, String displayName, String passwordHash);
}
