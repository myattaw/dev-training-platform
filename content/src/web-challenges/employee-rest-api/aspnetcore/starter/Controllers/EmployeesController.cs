using EmployeeApi.Models;
using EmployeeApi.Services;
using Microsoft.AspNetCore.Mvc;

namespace EmployeeApi.Controllers;

[ApiController]
[Route("api/employees")]
public class EmployeesController(EmployeeService employees) : ControllerBase
{
    // GET /api/employees
    [HttpGet]
    public IReadOnlyList<Employee> GetAll() => employees.All();

    // TODO: GET /api/employees/{id}: 200 with the employee, or 404.

    // TODO: POST /api/employees: 201 with a Location header and the new employee,
    // 400 with { "errors": { field: [messages] } } for invalid input,
    // 409 when the email address is already in use.
}
