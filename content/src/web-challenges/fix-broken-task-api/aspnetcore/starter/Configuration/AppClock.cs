namespace TaskApi.Configuration;

/// <summary>
/// The business date the service works with. Fixed so that "overdue" is
/// deterministic: every environment (and every test run) agrees on today.
/// </summary>
public static class AppClock
{
    public static readonly DateOnly Today = new(2026, 3, 15);
}
