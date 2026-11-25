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
        var name = request.Name?.Trim() ?? "";
        var email = request.Email?.Trim() ?? "";
        var department = request.Department?.Trim() ?? "";

        var errors = new Dictionary<string, string[]>();
        if (name.Length is 0 or > 100) errors["name"] = ["Name is required (1-100 characters)."];
        if (!IsEmail(email)) errors["email"] = ["Email must look like name@example.com."];
        if (!Departments.Contains(department))
            errors["department"] = [$"Department must be one of {string.Join(", ", Departments)}."];
        if (errors.Count > 0) return new CreateResult.Invalid(errors);

        if (repository.All().Any(e => e.Email == email)) return new CreateResult.Duplicate();
        return new CreateResult.Created(repository.Add(name, email, department));
    }

    private static bool IsEmail(string email)
    {
        var at = email.IndexOf('@');
        return at > 0 && at == email.LastIndexOf('@') && at < email.Length - 1 && !email.Contains(' ');
    }
}
