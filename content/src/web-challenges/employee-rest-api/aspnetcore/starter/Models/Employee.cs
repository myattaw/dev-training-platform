namespace EmployeeApi.Models;

/// <summary>An employee as stored and returned by the API.</summary>
public record Employee(int Id, string Name, string Email, string Department);
