namespace ExpenseApi.Models;

/// <summary>
/// Body of POST /api/reports. <c>Owner</c> is still sent by the old mobile app;
/// the server must not trust it.
/// </summary>
public sealed record CreateReportRequest(string? Title, long? AmountCents, string? Owner);
