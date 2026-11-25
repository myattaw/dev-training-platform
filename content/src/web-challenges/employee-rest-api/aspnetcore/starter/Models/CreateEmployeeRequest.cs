namespace EmployeeApi.Models;

/// <summary>The JSON body of POST /api/employees. Any field may be missing.</summary>
public record CreateEmployeeRequest(string? Name, string? Email, string? Department);
