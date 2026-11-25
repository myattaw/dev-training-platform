using EmployeeApi.Models;

namespace EmployeeApi.Data;

/// <summary>Stores employees. Ids start at 1 and are never reused.</summary>
public interface IEmployeeRepository
{
    IReadOnlyList<Employee> All();

    Employee? Find(int id);

    Employee? FindByEmail(string email);

    /// <summary>Stores a new employee with the next id and returns it.</summary>
    Employee Add(string name, string email, string department);
}
