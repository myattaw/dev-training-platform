package com.pracstack.employees.service;

import com.pracstack.employees.model.Employee;
import java.util.List;
import java.util.Map;

/** The outcome of creating an employee. */
public sealed interface CreateResult {
    record Created(Employee employee) implements CreateResult {}

    /** Invalid input: field name (name, email, department) to messages. */
    record Invalid(Map<String, List<String>> errors) implements CreateResult {}

    /** Another employee already has this email address. */
    record Duplicate() implements CreateResult {}
}
