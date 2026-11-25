using EmployeeApi.Data;
using EmployeeApi.Models;

namespace EmployeeApi.Services;

/// <summary>The outcome of creating an employee.</summary>
public abstract record CreateResult
{
    public sealed record Created(Employee Employee) : CreateResult;

    /// <summary>Invalid input: field name (name, email, department) → messages.</summary>
    public sealed record Invalid(IDictionary<string, string[]> Errors) : CreateResult;

    /// <summary>Another employee already has this email address.</summary>
    public sealed record Duplicate : CreateResult;
}

/// <summary>Business rules for employees.</summary>
public class EmployeeService(IEmployeeRepository repository)
{
    public static readonly string[] Departments = ["Engineering", "Finance", "Sales", "Support"];

    public IReadOnlyList<Employee> All() => repository.All();

    public Employee? Find(int id) => repository.Find(id);

    public CreateResult Create(CreateEmployeeRequest request)
    {
        // TODO: trim the fields, validate them, reject duplicate emails,
        // then store the employee (with its email in lower case).
        throw new NotImplementedException();
    }
}
