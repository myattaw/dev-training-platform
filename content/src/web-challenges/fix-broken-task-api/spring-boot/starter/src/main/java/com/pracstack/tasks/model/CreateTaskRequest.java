package com.pracstack.tasks.model;

/** The JSON body of POST /api/tasks. Any field may be missing (null). */
public record CreateTaskRequest(String title, String assignee, String dueDate) {}
