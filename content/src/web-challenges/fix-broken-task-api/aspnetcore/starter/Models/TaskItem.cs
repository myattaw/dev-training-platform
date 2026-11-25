namespace TaskApi.Models;

/// <summary>A task as stored and returned by the API. DueDate is serialized as "yyyy-MM-dd".</summary>
public record TaskItem(int Id, string Title, string Status, string? Assignee, DateOnly? DueDate);

/// <summary>The allowed task statuses (exact, lower case).</summary>
public static class TaskStatuses
{
    public const string Open = "open";
    public const string InProgress = "in_progress";
    public const string Done = "done";

    public static readonly string[] All = [Open, InProgress, Done];
}
