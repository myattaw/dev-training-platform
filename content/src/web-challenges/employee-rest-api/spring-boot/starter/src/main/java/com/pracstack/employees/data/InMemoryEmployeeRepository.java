package com.pracstack.employees.data;

import com.pracstack.employees.model.Employee;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import org.springframework.stereotype.Repository;

/** In-memory storage, seeded with three employees. Thread-safe. */
@Repository
public class InMemoryEmployeeRepository implements EmployeeRepository {
    private final List<Employee> employees = new ArrayList<>(List.of(
            new Employee(1, "Ada Lovelace", "ada@example.com", "Engineering"),
            new Employee(2, "Grace Hopper", "grace@example.com", "Engineering"),
            new Employee(3, "Linus Torvalds", "linus@example.com", "Support")));
    private long nextId = 4;

    @Override
    public synchronized List<Employee> findAll() {
        return employees.stream().sorted(Comparator.comparingLong(Employee::id)).toList();
    }

    @Override
    public synchronized Optional<Employee> findById(long id) {
        return employees.stream().filter(e -> e.id() == id).findFirst();
    }

    @Override
    public synchronized Optional<Employee> findByEmail(String email) {
        return employees.stream().filter(e -> e.email().equalsIgnoreCase(email)).findFirst();
    }

    @Override
    public synchronized Employee add(String name, String email, String department) {
        Employee employee = new Employee(nextId++, name, email, department);
        employees.add(employee);
        return employee;
    }
}
