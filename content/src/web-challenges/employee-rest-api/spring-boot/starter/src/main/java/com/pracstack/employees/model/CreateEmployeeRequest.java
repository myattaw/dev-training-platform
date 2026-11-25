package com.pracstack.employees.model;

/** The JSON body of POST /api/employees. Any field may be missing (null). */
public record CreateEmployeeRequest(String name, String email, String department) {}
