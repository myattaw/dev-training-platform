using TaskApi.Models;

namespace TaskApi.Data;

/// <summary>The tasks the service starts with.</summary>
public static class SeedData
{
    public static IEnumerable<TaskItem> Tasks() =>
    [
        new(1, "Write release notes", TaskStatuses.Open, "maria", new DateOnly(2026, 3, 10)),
        new(2, "Fix login timeout", TaskStatuses.InProgress, "dev", new DateOnly(2026, 3, 14)),
        new(3, "Update dependencies", TaskStatuses.Open, null, new DateOnly(2026, 3, 15)),
        new(4, "Plan sprint review", TaskStatuses.Done, "maria", new DateOnly(2026, 3, 1)),
        new(5, "Prepare demo data", TaskStatuses.Open, "li", new DateOnly(2026, 3, 20)),
        new(6, "Archive old tickets", TaskStatuses.Done, null, null),
        new(7, "Rotate API keys", TaskStatuses.InProgress, "sam", new DateOnly(2026, 3, 16)),
    ];
}
