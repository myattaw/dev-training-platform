package com.pracstack.registration.service;

import com.pracstack.registration.data.AccountRepository;
import com.pracstack.registration.model.RegisterRequest;
import com.pracstack.registration.model.UserAccount;
import com.pracstack.registration.security.PasswordHasher;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
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
        String email = request.email() == null ? "" : request.email().trim().toLowerCase(Locale.ROOT);
        String displayName = request.displayName() == null ? "" : request.displayName().trim();
        String password = request.password() == null ? "" : request.password();

        Map<String, List<String>> errors = new LinkedHashMap<>();
        boolean emailIsValid = isEmail(email);
        if (!emailIsValid) errors.put("email", List.of("Enter an email address like name@example.com."));
        if (displayName.length() < 2 || displayName.length() > 40) {
            errors.put("displayName", List.of("Display name must be 2-40 characters."));
        }
        String localPart = emailIsValid ? email.substring(0, email.indexOf('@')) : null;
        List<String> passwordErrors = passwordErrors(password, localPart);
        if (!passwordErrors.isEmpty()) errors.put("password", passwordErrors);
        if (request.confirmPassword() == null || request.confirmPassword().isEmpty()
                || !request.confirmPassword().equals(password)) {
            errors.put("confirmPassword", List.of("Passwords do not match."));
        }
        if (!Boolean.TRUE.equals(request.acceptTerms())) {
            errors.put("acceptTerms", List.of("You must accept the terms."));
        }
        if (!errors.isEmpty()) return new RegisterResult.Invalid(errors);

        synchronized (this) {
            if (repository.findByEmail(email).isPresent()) return new RegisterResult.Duplicate();
            return new RegisterResult.Created(repository.add(email, displayName, PasswordHasher.hash(password)));
        }
    }

    private static List<String> passwordErrors(String password, String localPart) {
        List<String> errors = new ArrayList<>();
        if (password.length() < 12) errors.add("Password must be at least 12 characters.");
        if (password.chars().noneMatch(c -> c >= 'A' && c <= 'Z')) errors.add("Password needs an upper-case letter.");
        if (password.chars().noneMatch(c -> c >= 'a' && c <= 'z')) errors.add("Password needs a lower-case letter.");
        if (password.chars().noneMatch(c -> c >= '0' && c <= '9')) errors.add("Password needs a digit.");
        if (localPart != null && password.toLowerCase(Locale.ROOT).contains(localPart)) {
            errors.add("Password must not contain your email address.");
        }
        return errors;
    }

    private static boolean isEmail(String email) {
        int at = email.indexOf('@');
        if (at <= 0 || at != email.lastIndexOf('@') || email.chars().anyMatch(Character::isWhitespace)) return false;
        String domain = email.substring(at + 1);
        return domain.contains(".") && !domain.startsWith(".") && !domain.endsWith(".");
    }
}
