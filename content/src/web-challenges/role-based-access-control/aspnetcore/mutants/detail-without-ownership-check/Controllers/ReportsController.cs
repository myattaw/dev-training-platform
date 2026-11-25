using ExpenseApi.Data;
using ExpenseApi.Models;
using ExpenseApi.Security;
using Microsoft.AspNetCore.Mvc;

namespace ExpenseApi.Controllers;

[ApiController]
[Route("api/reports")]
public class ReportsController(ReportRepository reports) : ControllerBase
{
    // Never null here: BearerTokenMiddleware answers 401 before unauthenticated
    // requests reach a controller.
    private AppUser Caller => CurrentUser.Get(HttpContext)!;

    private bool CanSee(ExpenseReport report) => Caller.IsAdmin || report.Owner == Caller.Username;

    // GET /api/reports: employees see their own reports, admins see all.
    [HttpGet]
    public IReadOnlyList<ExpenseReport> GetAll() => reports.All().Where(CanSee).ToList();

    // GET /api/reports/{id}: 404 (not 403) for someone else's report, so ids of
    // other people's reports are not revealed.
    [HttpGet("{id:int}")]
    public IActionResult Get(int id)
    {
        var report = reports.Find(id);
        return report is null ? NotFound() : Ok(report);
    }

    // POST /api/reports: the owner is the authenticated caller, whatever the body says.
    [HttpPost]
    public IActionResult Create(CreateReportRequest request)
    {
        var errors = Validate(request);
        if (errors.Count > 0) return BadRequest(new { errors });
        var report = reports.Add(Caller.Username, request.Title!.Trim(), request.AmountCents!.Value);
        return Created($"/api/reports/{report.Id}", report);
    }

    // POST /api/reports/{id}/approve: admins only. The role is checked first, so
    // employees get 403 whether or not the report exists.
    [HttpPost("{id:int}/approve")]
    public IActionResult Approve(int id)
    {
        if (!Caller.IsAdmin)
            return StatusCode(StatusCodes.Status403Forbidden, new { error = "Only admins can approve reports." });
        var report = reports.Find(id);
        if (report is null) return NotFound();
        if (report.Status == "approved")
            return Conflict(new { error = "The report is already approved." });
        return Ok(reports.Approve(id, Caller.Username));
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
