package com.pracstack.expenses.security;

import java.util.Map;
import java.util.Optional;
import org.springframework.stereotype.Component;

/**
 * Test identities for the sandbox: fixed bearer tokens mapped to users. There
 * is no real identity provider and there are no real credentials. Tokens are
 * case-sensitive.
 */
@Component
public class IdentityStore {
    private final Map<String, AppUser> byToken = Map.of(
            "test-token-alice", new AppUser("alice", "employee"),
            "test-token-bob", new AppUser("bob", "employee"),
            "test-token-admin", new AppUser("admin", "admin"));

    /** The user a token belongs to, or empty for an unknown token. */
    public Optional<AppUser> findByToken(String token) {
        return token == null ? Optional.empty() : Optional.ofNullable(byToken.get(token));
    }
}
