package com.pracstack.tasks.data;

import com.pracstack.tasks.model.TaskItem;
import com.pracstack.tasks.model.TaskStatuses;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import org.springframework.stereotype.Repository;

/**
 * In-memory task storage (a singleton bean), seeded from SeedData. Ids start
 * at 1 and are never reused. Thread-safe for concurrent requests.
 */
@Repository
public class TaskRepository {
    private final List<TaskItem> tasks = new ArrayList<>(SeedData.tasks());
    private long nextId = 8;

    public synchronized Optional<TaskItem> findById(long id) {
        return tasks.stream().filter(t -> t.id() == id).findFirst();
    }

    /** Tasks ordered by id, optionally only those with a status and/or only the overdue ones. */
    public synchronized List<TaskItem> search(String status, boolean overdueOnly, LocalDate today) {
        List<TaskItem> result = new ArrayList<>(tasks);
        result.sort(Comparator.comparingLong(TaskItem::id));
        if (status != null) {
            result.removeIf(t -> !t.status().equals(status));
        }
        if (overdueOnly) {
            result.removeIf(t -> !isOverdue(t, today));
        }
        return result;
    }

    private static boolean isOverdue(TaskItem task, LocalDate today) {
        return task.dueDate() != null
                && !task.dueDate().isAfter(today)
                && !task.status().equals(TaskStatuses.DONE);
    }

    /** Stores a new task with the next id and returns it. */
    public synchronized TaskItem add(String title, String status, String assignee, LocalDate dueDate) {
        TaskItem task = new TaskItem(nextId++, title, status, assignee, dueDate);
        tasks.add(task);
        return task;
    }

    /** Replaces the stored task that has the same id. */
    public synchronized void save(TaskItem task) {
        for (int i = 0; i < tasks.size(); i++) {
            if (tasks.get(i).id() == task.id()) {
                tasks.set(i, task);
                return;
            }
        }
    }
}
