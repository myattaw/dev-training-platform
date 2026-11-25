using QuoteApi.Models;

namespace QuoteApi.Data;

/// <summary>
/// Every notification handed to a channel (a singleton standing in for a mail
/// relay). Thread-safe.
/// </summary>
public sealed class Outbox
{
    private readonly object _gate = new();
    private readonly List<Notification> _sent = [];
    private int _nextId = 1;

    public Notification Add(string channel, string recipient, string message)
    {
        lock (_gate)
        {
            var notification = new Notification(_nextId++, channel, recipient, message);
            _sent.Add(notification);
            return notification;
        }
    }

    public IReadOnlyList<Notification> All()
    {
        lock (_gate) return _sent.ToList();
    }
}
