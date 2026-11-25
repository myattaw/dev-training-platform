package com.pracstack.tasks.service;

import com.pracstack.tasks.model.TaskItem;
import java.util.List;
import java.util.Map;

/** The outcome of a change: the task, invalid input, or an unknown task. */
public sealed interface TaskResult {
    record Ok(TaskItem task) implements TaskResult {}

    /** Invalid input: field name to messages. */
    record Invalid(Map<String, List<String>> errors) implements TaskResult {}

    record NotFound() implements TaskResult {}
}
