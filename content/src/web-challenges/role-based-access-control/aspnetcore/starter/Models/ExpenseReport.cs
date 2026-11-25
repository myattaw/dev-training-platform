namespace ExpenseApi.Models;

/// <summary>An expense report. Status: <c>submitted</c> or <c>approved</c>.</summary>
public sealed record ExpenseReport(
    int Id,
    string Owner,
    string Title,
    long AmountCents,
    string Status,
    string? ApprovedBy);
