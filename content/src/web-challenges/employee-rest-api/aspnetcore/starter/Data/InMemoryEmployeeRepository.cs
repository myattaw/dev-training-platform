using EmployeeApi.Models;

namespace EmployeeApi.Data;

/// <summary>
/// In-memory storage, seeded with three employees. Registered as a singleton, so
/// data lives as long as the application. Thread-safe for concurrent requests.
/// </summary>
public sealed class InMemoryEmployeeRepository : IEmployeeRepository
{
    private readonly object _gate = new();
    private readonly List<Employee> _employees =
    [
        new(1, "Ada Lovelace", "ada@example.com", "Engineering"),
        new(2, "Grace Hopper", "grace@example.com", "Engineering"),
        new(3, "Linus Torvalds", "linus@example.com", "Support"),
    ];
    private int _nextId = 4;

    public IReadOnlyList<Employee> All()
    {
        lock (_gate) return _employees.OrderBy(e => e.Id).ToList();
    }

    public Employee? Find(int id)
    {
        lock (_gate) return _employees.FirstOrDefault(e => e.Id == id);
    }

    public Employee? FindByEmail(string email)
    {
        lock (_gate)
        {
            return _employees.FirstOrDefault(e =>
                string.Equals(e.Email, email, StringComparison.OrdinalIgnoreCase));
        }
    }

    public Employee Add(string name, string email, string department)
    {
        lock (_gate)
        {
            var employee = new Employee(_nextId++, name, email, department);
            _employees.Add(employee);
            return employee;
        }
    }
}
