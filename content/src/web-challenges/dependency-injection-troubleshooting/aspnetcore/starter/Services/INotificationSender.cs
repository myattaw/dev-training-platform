using QuoteApi.Models;

namespace QuoteApi.Services;

/// <summary>Hands a notification to a delivery channel.</summary>
public interface INotificationSender
{
    Notification Send(string recipient, string message);
}
