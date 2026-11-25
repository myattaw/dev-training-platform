package com.pracstack.employees.service;

import com.pracstack.employees.data.EmployeeRepository;
import com.pracstack.employees.model.CreateEmployeeRequest;
import com.pracstack.employees.model.Employee;
import java.util.List;
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
        // TODO: trim the fields, validate them, reject duplicate emails,
        // then store the employee (with its email in lower case).
        throw new UnsupportedOperationException("Not implemented yet");
    }
}
