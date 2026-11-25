package com.pracstack.tasks.model;

import java.time.LocalDate;

/** A task as stored and returned by the API. dueDate is serialized as "yyyy-MM-dd" (or null). */
public record TaskItem(long id, String title, String status, String assignee, LocalDate dueDate) {
    /** A copy of this task with another status. */
    public TaskItem withStatus(String newStatus) {
        return new TaskItem(id, title, newStatus, assignee, dueDate);
    }
}
