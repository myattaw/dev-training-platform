using System.Globalization;
using TaskApi.Configuration;
using TaskApi.Data;
using TaskApi.Models;

namespace TaskApi.Services;

/// <summary>The outcome of a change: the task, invalid input, or an unknown task.</summary>
public abstract record TaskResult
{
    public sealed record Ok(TaskItem Task) : TaskResult;

    /// <summary>Invalid input: field name → messages.</summary>
    public sealed record Invalid(IDictionary<string, string[]> Errors) : TaskResult;

    public sealed record NotFound : TaskResult;
}

/// <summary>Business rules for tasks.</summary>
public class TaskService(TaskRepository repository)
{
    public TaskItem? Find(int id) => repository.Find(id);

    public IReadOnlyList<TaskItem> Search(string? status, bool overdueOnly) =>
        repository.Search(status, overdueOnly, AppClock.Today);

    public TaskResult Create(CreateTaskRequest request)
    {
        var title = request.Title?.Trim();
        var assignee = string.IsNullOrWhiteSpace(request.Assignee) ? null : request.Assignee.Trim();
        DateOnly? dueDate = null;

        var errors = new Dictionary<string, string[]>();
        if (title is null) errors["title"] = ["Title is required."];
        else if (title.Length > 200) errors["title"] = ["Title must be at most 200 characters."];
        if (request.DueDate is not null)
        {
            if (DateOnly.TryParseExact(request.DueDate, "yyyy-MM-dd", CultureInfo.InvariantCulture,
                    DateTimeStyles.None, out var parsed))
                dueDate = parsed;
            else
                errors["dueDate"] = ["Due date must be a date in the format yyyy-MM-dd."];
        }
        if (errors.Count > 0) return new TaskResult.Invalid(errors);

        return new TaskResult.Ok(repository.Add(title!, TaskStatuses.Open, assignee, dueDate));
    }

    public TaskResult SetStatus(int id, UpdateStatusRequest request)
    {
        var task = repository.Find(id);
        if (task is null) return new TaskResult.NotFound();
        if (request.Status is null || !TaskStatuses.All.Contains(request.Status))
        {
            return new TaskResult.Invalid(new Dictionary<string, string[]>
            {
                ["status"] = [$"Status must be one of {string.Join(", ", TaskStatuses.All)}."],
            });
        }

        var updated = task with { Status = request.Status };
        repository.Update(updated);
        return new TaskResult.Ok(updated);
    }
}
