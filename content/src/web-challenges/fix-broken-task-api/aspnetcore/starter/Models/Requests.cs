namespace TaskApi.Models;

/// <summary>The JSON body of POST /api/tasks. Any field may be missing.</summary>
public record CreateTaskRequest(string? Title, string? Assignee, string? DueDate);

/// <summary>The JSON body of PUT /api/tasks/{id}/status.</summary>
public record UpdateStatusRequest(string? Status);
