using QuoteApi.Data;
using QuoteApi.Models;

namespace QuoteApi.Services;

/// <summary>Sends notifications by email (through the outbox).</summary>
public sealed class EmailNotificationSender(Outbox outbox) : INotificationSender
{
    public Notification Send(string recipient, string message) =>
        outbox.Add("email", recipient, message);
}
