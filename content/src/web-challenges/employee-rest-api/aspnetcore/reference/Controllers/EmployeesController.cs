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

    [HttpGet("{id:int}")]
    public ActionResult<Employee> GetById(int id) =>
        employees.Find(id) is { } employee ? employee : NotFound();

    [HttpPost]
    public IActionResult Create(CreateEmployeeRequest request) =>
        employees.Create(request) switch
        {
            CreateResult.Created created =>
                CreatedAtAction(nameof(GetById), new { id = created.Employee.Id }, created.Employee),
            CreateResult.Invalid invalid => BadRequest(new { errors = invalid.Errors }),
            CreateResult.Duplicate => Conflict(new { errors = new { email = new[] { "Email is already in use." } } }),
            _ => throw new InvalidOperationException(),
        };
}
