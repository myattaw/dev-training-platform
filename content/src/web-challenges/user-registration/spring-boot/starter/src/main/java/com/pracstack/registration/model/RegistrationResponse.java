package com.pracstack.registration.model;

/** What the API returns for an account: never the password or its hash. */
public record RegistrationResponse(long id, String email, String displayName) {
    public static RegistrationResponse from(UserAccount account) {
        return new RegistrationResponse(account.id(), account.email(), account.displayName());
    }
}
