namespace QuoteApi.Models;

/// <summary>Body of POST /api/notifications.</summary>
public sealed record NotificationRequest(string? Recipient, string? Message);

/// <summary>A notification handed to a channel.</summary>
public sealed record Notification(int Id, string Channel, string Recipient, string Message);
