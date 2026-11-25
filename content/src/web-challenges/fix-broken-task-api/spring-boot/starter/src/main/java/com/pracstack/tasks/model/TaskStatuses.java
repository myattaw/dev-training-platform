package com.pracstack.tasks.model;

import java.util.List;

/** The allowed task statuses (exact, lower case). */
public final class TaskStatuses {
    public static final String OPEN = "open";
    public static final String IN_PROGRESS = "in_progress";
    public static final String DONE = "done";

    public static final List<String> ALL = List.of(OPEN, IN_PROGRESS, DONE);

    private TaskStatuses() {}
}
