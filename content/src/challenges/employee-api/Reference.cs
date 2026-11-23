// Reference solution. Private: used only to prove the tests are correct.
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;

public record Employee(int Id, string Name, string Email, string Department);

public record CreateEmployeeRequest(string? Name, string? Email, string? Department);

public record EmployeePage(IReadOnlyList<Employee> Items, int Page, int PageSize, int TotalCount);

public sealed class EmployeeStore
{
    private readonly Lock _gate = new();
    private readonly SortedDictionary<int, Employee> _byId = [];
    private int _lastId;

    public Employee? Find(int id)
    {
        lock (_gate) return _byId.GetValueOrDefault(id);
    }

    /// <summary>Adds the employee, or returns null when the email is already used.</summary>
    public Employee? TryAdd(string name, string email, string department)
    {
        lock (_gate)
        {
            if (_byId.Values.Any(e => e.Email == email)) return null;
            var employee = new Employee(++_lastId, name, email, department);
            _byId.Add(employee.Id, employee);
            return employee;
        }
    }

    public bool Remove(int id)
    {
        lock (_gate) return _byId.Remove(id);
    }

    public EmployeePage Page(int page, int pageSize)
    {
        lock (_gate)
        {
            var items = _byId.Values.Skip((page - 1) * pageSize).Take(pageSize).ToList();
            return new EmployeePage(items, page, pageSize, _byId.Count);
        }
    }
}

public static class EmployeeApi
{
    private static readonly string[] Departments = ["Engineering", "Finance", "Sales", "Support"];

    public static void ConfigureServices(IServiceCollection services) => services.AddSingleton<EmployeeStore>();

    public static void MapEndpoints(IEndpointRouteBuilder app)
    {
        var employees = app.MapGroup("/employees");

        employees.MapGet("/{id:int}", (int id, EmployeeStore store) =>
            store.Find(id) is { } employee ? Results.Ok(employee) : Results.NotFound());

        employees.MapGet("/", (int? page, int? pageSize, EmployeeStore store) =>
        {
            var p = page ?? 1;
            var size = pageSize ?? 10;
            var errors = new Dictionary<string, string[]>();
            if (p < 1) errors["page"] = ["page must be 1 or more."];
            if (size is < 1 or > 50) errors["pageSize"] = ["pageSize must be between 1 and 50."];
            return errors.Count > 0 ? Results.ValidationProblem(errors) : Results.Ok(store.Page(p, size));
        });

        employees.MapPost("/", (CreateEmployeeRequest request, EmployeeStore store) =>
        {
            var name = request.Name?.Trim() ?? "";
            var email = request.Email?.Trim().ToLowerInvariant() ?? "";
            var department = request.Department?.Trim() ?? "";
            var errors = new Dictionary<string, string[]>();
            if (name.Length is 0 or > 100) errors["name"] = ["Name is required (at most 100 characters)."];
            if (!IsEmail(email)) errors["email"] = ["Enter an email address such as ada@example.com."];
            if (!Departments.Contains(department))
            {
                errors["department"] = [$"Department must be one of: {string.Join(", ", Departments)}."];
            }
            if (errors.Count > 0) return Results.ValidationProblem(errors);

            return store.TryAdd(name, email, department) is { } created
                ? Results.Created($"/employees/{created.Id}", created)
                : Results.Conflict(new { error = "An employee with this email address already exists." });
        });

        employees.MapDelete("/{id:int}", (int id, EmployeeStore store) =>
            store.Remove(id) ? Results.NoContent() : Results.NotFound());
    }

    private static bool IsEmail(string email)
    {
        var at = email.IndexOf('@');
        return at > 0 && at == email.LastIndexOf('@') && at < email.Length - 1 && !email.Contains(' ');
    }
}
