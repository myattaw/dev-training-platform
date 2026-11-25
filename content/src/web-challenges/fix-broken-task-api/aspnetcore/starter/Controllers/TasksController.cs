using Microsoft.AspNetCore.Mvc;
using TaskApi.Models;
using TaskApi.Services;

namespace TaskApi.Controllers;

[ApiController]
[Route("api/tasks")]
public class TasksController(TaskService tasks) : ControllerBase
{
    // GET /api/tasks?status=open&overdue=true
    [HttpGet]
    public IReadOnlyList<TaskItem> Search([FromQuery] string? status, [FromQuery] bool overdue = false) =>
        tasks.Search(status, overdue);

    [HttpGet("{id:int}")]
    public ActionResult<TaskItem> GetById(int id) =>
        tasks.Find(id) is { } task ? task : NotFound();

    [HttpPost]
    public IActionResult Create(CreateTaskRequest request) =>
        tasks.Create(request) switch
        {
            TaskResult.Ok ok => Ok(ok.Task),
            TaskResult.Invalid invalid => BadRequest(new { errors = invalid.Errors }),
            _ => throw new InvalidOperationException(),
        };

    [HttpPut("{id:int}/status")]
    public IActionResult SetStatus(int id, UpdateStatusRequest request) =>
        tasks.SetStatus(id, request) switch
        {
            TaskResult.Ok ok => Ok(ok.Task),
            TaskResult.Invalid invalid => BadRequest(new { errors = invalid.Errors }),
            TaskResult.NotFound => NotFound(),
            _ => throw new InvalidOperationException(),
        };
}
