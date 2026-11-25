package com.pracstack.tasks.web;

import com.pracstack.tasks.model.CreateTaskRequest;
import com.pracstack.tasks.model.TaskItem;
import com.pracstack.tasks.model.UpdateStatusRequest;
import com.pracstack.tasks.service.TaskResult;
import com.pracstack.tasks.service.TaskService;
import java.net.URI;
import java.util.List;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/tasks")
public class TaskController {
    private final TaskService tasks;

    public TaskController(TaskService tasks) {
        this.tasks = tasks;
    }

    // GET /api/tasks?status=open&overdue=true
    @GetMapping
    public List<TaskItem> search(
            @RequestParam(required = false) String status,
            @RequestParam(defaultValue = "false") boolean overdue) {
        return tasks.search(status, overdue);
    }

    @GetMapping("/{id}")
    public ResponseEntity<TaskItem> getById(@PathVariable long id) {
        return ResponseEntity.of(tasks.findById(id));
    }

    @PostMapping
    public ResponseEntity<?> create(@RequestBody CreateTaskRequest request) {
        return switch (tasks.create(request)) {
            case TaskResult.Ok ok -> ResponseEntity.created(URI.create("/api/tasks/" + ok.task().id())).body(ok.task());
            case TaskResult.Invalid invalid -> ResponseEntity.badRequest().body(Map.of("errors", invalid.errors()));
            case TaskResult.NotFound notFound -> ResponseEntity.notFound().build();
        };
    }

    @PutMapping("/{id}/status")
    public ResponseEntity<?> setStatus(@PathVariable long id, @RequestBody UpdateStatusRequest request) {
        return switch (tasks.setStatus(id, request)) {
            case TaskResult.Ok ok -> ResponseEntity.ok(ok.task());
            case TaskResult.Invalid invalid -> ResponseEntity.badRequest().body(Map.of("errors", invalid.errors()));
            case TaskResult.NotFound notFound -> ResponseEntity.notFound().build();
        };
    }
}
