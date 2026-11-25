package com.pracstack.registration.web;

import com.pracstack.registration.model.RegisterRequest;
import com.pracstack.registration.model.RegistrationResponse;
import com.pracstack.registration.service.RegisterResult;
import com.pracstack.registration.service.RegistrationService;
import java.net.URI;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
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

    @PostMapping
    public ResponseEntity<?> register(@RequestBody RegisterRequest request) {
        return switch (registrations.register(request)) {
            case RegisterResult.Created created ->
                    ResponseEntity.created(URI.create("/api/registrations/" + created.account().id()))
                            .body(RegistrationResponse.from(created.account()));
            case RegisterResult.Invalid invalid ->
                    ResponseEntity.badRequest().body(Map.of("errors", invalid.errors()));
            case RegisterResult.Duplicate duplicate ->
                    ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of(
                            "errors", Map.of("email", List.of("This email address is already registered."))));
        };
    }
}
