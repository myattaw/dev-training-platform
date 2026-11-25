package com.pracstack.tasks.data;

import com.pracstack.tasks.model.TaskItem;
import com.pracstack.tasks.model.TaskStatuses;
import java.time.LocalDate;
import java.util.List;

/** The tasks the service starts with. */
public final class SeedData {
    private SeedData() {}

    public static List<TaskItem> tasks() {
        return List.of(
                new TaskItem(1, "Write release notes", TaskStatuses.OPEN, "maria", LocalDate.of(2026, 3, 10)),
                new TaskItem(2, "Fix login timeout", TaskStatuses.IN_PROGRESS, "dev", LocalDate.of(2026, 3, 14)),
                new TaskItem(3, "Update dependencies", TaskStatuses.OPEN, null, LocalDate.of(2026, 3, 15)),
                new TaskItem(4, "Plan sprint review", TaskStatuses.DONE, "maria", LocalDate.of(2026, 3, 1)),
                new TaskItem(5, "Prepare demo data", TaskStatuses.OPEN, "li", LocalDate.of(2026, 3, 20)),
                new TaskItem(6, "Archive old tickets", TaskStatuses.DONE, null, null),
                new TaskItem(7, "Rotate API keys", TaskStatuses.IN_PROGRESS, "sam", LocalDate.of(2026, 3, 16)));
    }
}
