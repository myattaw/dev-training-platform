using ExpenseApi.Data;
using ExpenseApi.Models;
using ExpenseApi.Security;
using Microsoft.AspNetCore.Mvc;

namespace ExpenseApi.Controllers;

[ApiController]
[Route("api/reports")]
public class ReportsController(ReportRepository reports) : ControllerBase
{
    // The authenticated user (set by BearerTokenMiddleware), or null.
    private AppUser? Caller => CurrentUser.Get(HttpContext);

    // GET /api/reports
    // TODO: employees see only their own reports; admins see every report.
    [HttpGet]
    public IReadOnlyList<ExpenseReport> GetAll() => reports.All();

    // GET /api/reports/{id}
    // TODO: only the owner or an admin may read a report; anyone else gets 404.
    [HttpGet("{id:int}")]
    public IActionResult Get(int id)
    {
        var report = reports.Find(id);
        return report is null ? NotFound() : Ok(report);
    }

    // POST /api/reports
    // TODO: the owner is the caller, never a value from the body.
    [HttpPost]
    public IActionResult Create(CreateReportRequest request)
    {
        var errors = Validate(request);
        if (errors.Count > 0) return BadRequest(new { errors });
        var report = reports.Add(request.Owner ?? "unknown", request.Title!.Trim(), request.AmountCents!.Value);
        return Created($"/api/reports/{report.Id}", report);
    }

    // POST /api/reports/{id}/approve
    // TODO: admins only (403 for everyone else).
    [HttpPost("{id:int}/approve")]
    public IActionResult Approve(int id)
    {
        var report = reports.Find(id);
        if (report is null) return NotFound();
        if (report.Status == "approved")
            return Conflict(new { error = "The report is already approved." });
        return Ok(reports.Approve(id, Caller?.Username ?? "unknown"));
    }

    private static Dictionary<string, string[]> Validate(CreateReportRequest request)
    {
        var errors = new Dictionary<string, string[]>();
        var title = request.Title?.Trim();
        if (string.IsNullOrEmpty(title)) errors["title"] = ["Title is required."];
        else if (title.Length > 100) errors["title"] = ["Title must be at most 100 characters."];
        if (request.AmountCents is not (>= 1 and <= 1_000_000))
            errors["amountCents"] = ["Amount must be between 1 and 1000000 cents."];
        return errors;
    }
}
