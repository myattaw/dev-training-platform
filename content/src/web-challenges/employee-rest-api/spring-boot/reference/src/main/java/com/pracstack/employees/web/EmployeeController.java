package com.pracstack.employees.web;

import com.pracstack.employees.model.CreateEmployeeRequest;
import com.pracstack.employees.model.Employee;
import com.pracstack.employees.service.CreateResult;
import com.pracstack.employees.service.EmployeeService;
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
@RequestMapping("/api/employees")
public class EmployeeController {
    private final EmployeeService employees;

    public EmployeeController(EmployeeService employees) {
        this.employees = employees;
    }

    // GET /api/employees
    @GetMapping
    public List<Employee> getAll() {
        return employees.findAll();
    }

    @GetMapping("/{id}")
    public ResponseEntity<Employee> getById(@PathVariable long id) {
        return ResponseEntity.of(employees.findById(id));
    }

    @PostMapping
    public ResponseEntity<?> create(@RequestBody CreateEmployeeRequest request) {
        return switch (employees.create(request)) {
            case CreateResult.Created created ->
                    ResponseEntity.created(URI.create("/api/employees/" + created.employee().id()))
                            .body(created.employee());
            case CreateResult.Invalid invalid ->
                    ResponseEntity.badRequest().body(Map.of("errors", invalid.errors()));
            case CreateResult.Duplicate duplicate ->
                    ResponseEntity.status(HttpStatus.CONFLICT)
                            .body(Map.of("errors", Map.of("email", List.of("Email is already in use."))));
        };
    }
}
