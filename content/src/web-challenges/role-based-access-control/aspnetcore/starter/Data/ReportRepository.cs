using ExpenseApi.Models;

namespace ExpenseApi.Data;

/// <summary>
/// In-memory expense reports (a singleton), seeded with three reports.
/// Thread-safe. It stores what it is given: it does not check permissions.
/// </summary>
public sealed class ReportRepository
{
    private readonly object _gate = new();
    private readonly List<ExpenseReport> _reports =
    [
        new(1, "alice", "Client dinner", 8450, "submitted", null),
        new(2, "bob", "Train tickets", 12900, "submitted", null),
        new(3, "alice", "Conference pass", 49900, "approved", "admin"),
    ];
    private int _nextId = 4;

    public IReadOnlyList<ExpenseReport> All()
    {
        lock (_gate) return _reports.OrderBy(r => r.Id).ToList();
    }

    public ExpenseReport? Find(int id)
    {
        lock (_gate) return _reports.FirstOrDefault(r => r.Id == id);
    }

    public ExpenseReport Add(string owner, string title, long amountCents)
    {
        lock (_gate)
        {
            var report = new ExpenseReport(_nextId++, owner, title, amountCents, "submitted", null);
            _reports.Add(report);
            return report;
        }
    }

    /// <summary>Marks a report approved by <paramref name="approver"/>; null if it does not exist.</summary>
    public ExpenseReport? Approve(int id, string approver)
    {
        lock (_gate)
        {
            var index = _reports.FindIndex(r => r.Id == id);
            if (index < 0) return null;
            var approved = _reports[index] with { Status = "approved", ApprovedBy = approver };
            _reports[index] = approved;
            return approved;
        }
    }
}
