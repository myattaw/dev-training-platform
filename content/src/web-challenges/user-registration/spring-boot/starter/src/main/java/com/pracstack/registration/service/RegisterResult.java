package com.pracstack.registration.service;

import com.pracstack.registration.model.UserAccount;
import java.util.List;
import java.util.Map;

/** The outcome of a registration. */
public sealed interface RegisterResult {
    record Created(UserAccount account) implements RegisterResult {}

    /** Invalid input: field name (email, displayName, password, confirmPassword, acceptTerms) to messages. */
    record Invalid(Map<String, List<String>> errors) implements RegisterResult {}

    /** An account with this email address already exists. */
    record Duplicate() implements RegisterResult {}
}
