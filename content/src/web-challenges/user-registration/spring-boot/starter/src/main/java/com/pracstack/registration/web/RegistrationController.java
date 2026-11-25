package com.pracstack.registration.web;

import com.pracstack.registration.model.RegistrationResponse;
import com.pracstack.registration.service.RegistrationService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/registrations")
public class RegistrationController {
    private final RegistrationService registrations;

    public RegistrationController(RegistrationService registrations) {
        this.registrations = registrations;
    }

    // GET /api/registrations/{id}
    @GetMapping("/{id}")
    public ResponseEntity<RegistrationResponse> getById(@PathVariable long id) {
        return ResponseEntity.of(registrations.findById(id).map(RegistrationResponse::from));
    }

    // TODO: POST /api/registrations: 201 with a Location header and the new account
    // (id, email, displayName: never the password), 400 with
    // { "errors": { field: [messages] } } listing every invalid field,
    // 409 when the email address is already registered.
}
