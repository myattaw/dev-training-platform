package com.pracstack.tasks.service;

import com.pracstack.tasks.config.AppClock;
import com.pracstack.tasks.data.TaskRepository;
import com.pracstack.tasks.model.CreateTaskRequest;
import com.pracstack.tasks.model.TaskItem;
import com.pracstack.tasks.model.TaskStatuses;
import com.pracstack.tasks.model.UpdateStatusRequest;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.springframework.stereotype.Service;

/** Business rules for tasks. */
@Service
public class TaskService {
    private final TaskRepository repository;

    public TaskService(TaskRepository repository) {
        this.repository = repository;
    }

    public Optional<TaskItem> findById(long id) {
        return repository.findById(id);
    }

    public List<TaskItem> search(String status, boolean overdueOnly) {
        return repository.search(status, overdueOnly, AppClock.TODAY);
    }

    public TaskResult create(CreateTaskRequest request) {
        String title = request.title() == null ? null : request.title().strip();
        String assignee = request.assignee() == null || request.assignee().isBlank()
                ? null
                : request.assignee().strip();
        LocalDate dueDate = null;

        Map<String, List<String>> errors = new LinkedHashMap<>();
        if (title == null) {
            errors.put("title", List.of("Title is required."));
        } else if (title.length() > 200) {
            errors.put("title", List.of("Title must be at most 200 characters."));
        }
        if (request.dueDate() != null) {
            try {
                dueDate = LocalDate.parse(request.dueDate());
            } catch (DateTimeParseException e) {
                errors.put("dueDate", List.of("Due date must be a date in the format yyyy-MM-dd."));
            }
        }
        if (!errors.isEmpty()) return new TaskResult.Invalid(errors);

        return new TaskResult.Ok(repository.add(title, TaskStatuses.OPEN, assignee, dueDate));
    }

    public TaskResult setStatus(long id, UpdateStatusRequest request) {
        Optional<TaskItem> task = repository.findById(id);
        if (task.isEmpty()) return new TaskResult.NotFound();
        if (request.status() == null || !TaskStatuses.ALL.contains(request.status())) {
            return new TaskResult.Invalid(Map.of(
                    "status", List.of("Status must be one of " + String.join(", ", TaskStatuses.ALL) + ".")));
        }

        TaskItem updated = task.get().withStatus(request.status());
        return new TaskResult.Ok(updated);
    }
}
