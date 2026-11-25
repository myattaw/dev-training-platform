using TaskApi.Models;

namespace TaskApi.Data;

/// <summary>
/// In-memory task storage (a singleton), seeded from SeedData. Ids start at 1
/// and are never reused. Thread-safe for concurrent requests.
/// </summary>
public sealed class TaskRepository
{
    private readonly object _gate = new();
    private readonly List<TaskItem> _tasks = SeedData.Tasks().ToList();
    private int _nextId = 8;

    public TaskItem? Find(int id)
    {
        lock (_gate) return _tasks.FirstOrDefault(t => t.Id == id);
    }

    /// <summary>Tasks ordered by id, optionally only those with a status and/or only the overdue ones.</summary>
    public IReadOnlyList<TaskItem> Search(string? status, bool overdueOnly, DateOnly today)
    {
        lock (_gate)
        {
            var result = _tasks.OrderBy(t => t.Id).ToList();
            if (status is not null)
                result.RemoveAll(t => t.Status != status);
            if (overdueOnly)
                result.RemoveAll(t => !IsOverdue(t, today));
            return result;
        }
    }

    private static bool IsOverdue(TaskItem task, DateOnly today) =>
        task.DueDate is { } due && due < today && task.Status != TaskStatuses.Done;

    /// <summary>Stores a new task with the next id and returns it.</summary>
    public TaskItem Add(string title, string status, string? assignee, DateOnly? dueDate)
    {
        lock (_gate)
        {
            var task = new TaskItem(_nextId++, title, status, assignee, dueDate);
            _tasks.Add(task);
            return task;
        }
    }

    /// <summary>Replaces the stored task that has the same id.</summary>
    public void Update(TaskItem task)
    {
        lock (_gate)
        {
            var index = _tasks.FindIndex(t => t.Id == task.Id);
            if (index >= 0) _tasks[index] = task;
        }
    }
}
