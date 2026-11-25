package com.pracstack.employees.web;

import com.pracstack.employees.model.Employee;
import com.pracstack.employees.service.EmployeeService;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
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

    // TODO: GET /api/employees/{id}: 200 with the employee, or 404.

    // TODO: POST /api/employees: 201 with a Location header and the new employee,
    // 400 with { "errors": { field: [messages] } } for invalid input,
    // 409 when the email address is already in use.
}
