package com.pracstack.employees.model;

/** An employee as stored and returned by the API. */
public record Employee(long id, String name, String email, String department) {}
