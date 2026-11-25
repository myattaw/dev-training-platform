package com.pracstack.employees.service;

import com.pracstack.employees.data.EmployeeRepository;
import com.pracstack.employees.model.CreateEmployeeRequest;
import com.pracstack.employees.model.Employee;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import org.springframework.stereotype.Service;

/** Business rules for employees. */
@Service
public class EmployeeService {
    public static final List<String> DEPARTMENTS = List.of("Engineering", "Finance", "Sales", "Support");

    private final EmployeeRepository repository;

    public EmployeeService(EmployeeRepository repository) {
        this.repository = repository;
    }

    public List<Employee> findAll() {
        return repository.findAll();
    }

    public Optional<Employee> findById(long id) {
        return repository.findById(id);
    }

    public CreateResult create(CreateEmployeeRequest request) {
        String name = request.name() == null ? "" : request.name().trim();
        String email = request.email() == null ? "" : request.email().trim().toLowerCase(Locale.ROOT);
        String department = request.department() == null ? "" : request.department().trim();

        Map<String, List<String>> errors = new LinkedHashMap<>();
        if (name.isEmpty() || name.length() > 100) errors.put("name", List.of("Name is required (1-100 characters)."));
        if (!isEmail(email)) errors.put("email", List.of("Email must look like name@example.com."));
        if (!DEPARTMENTS.contains(department)) {
            errors.put("department", List.of("Department must be one of " + String.join(", ", DEPARTMENTS) + "."));
        }
        if (!errors.isEmpty()) return new CreateResult.Invalid(errors);

        synchronized (this) {
            if (repository.findByEmail(email).isPresent()) return new CreateResult.Duplicate();
            return new CreateResult.Created(repository.add(name, email, department));
        }
    }

    private static boolean isEmail(String email) {
        int at = email.indexOf('@');
        return email.contains("@");
    }
}
