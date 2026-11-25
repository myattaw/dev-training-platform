package com.pracstack.employees.data;

import com.pracstack.employees.model.Employee;
import java.util.List;
import java.util.Optional;

/** Stores employees. Ids start at 1 and are never reused. */
public interface EmployeeRepository {
    List<Employee> findAll();

    Optional<Employee> findById(long id);

    Optional<Employee> findByEmail(String email);

    /** Stores a new employee with the next id and returns it. */
    Employee add(String name, String email, String department);
}
