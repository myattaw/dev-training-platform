package com.pracstack.registration.service;

import com.pracstack.registration.data.AccountRepository;
import com.pracstack.registration.model.RegisterRequest;
import com.pracstack.registration.model.UserAccount;
import com.pracstack.registration.security.PasswordHasher;
import java.util.Optional;
import org.springframework.stereotype.Service;

/** Registration rules. */
@Service
public class RegistrationService {
    private final AccountRepository repository;

    public RegistrationService(AccountRepository repository) {
        this.repository = repository;
    }

    public Optional<UserAccount> findById(long id) {
        return repository.findById(id);
    }

    public RegisterResult register(RegisterRequest request) {
        // TODO: normalize the input (trim the email and display name, lower-case the email),
        // check every rule and collect an error for each invalid field,
        // reject an email that is already registered (ignoring case),
        // then store the account with PasswordHasher.hash(password), never the password itself.
        throw new UnsupportedOperationException("Not implemented yet");
    }
}
