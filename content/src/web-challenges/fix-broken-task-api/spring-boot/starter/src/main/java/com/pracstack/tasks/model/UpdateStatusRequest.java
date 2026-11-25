package com.pracstack.tasks.model;

/** The JSON body of PUT /api/tasks/{id}/status. */
public record UpdateStatusRequest(String status) {}
