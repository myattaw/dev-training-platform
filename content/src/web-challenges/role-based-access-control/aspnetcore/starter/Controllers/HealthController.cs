using Microsoft.AspNetCore.Mvc;

namespace ExpenseApi.Controllers;

[ApiController]
[Route("api/health")]
public class HealthController : ControllerBase
{
    // GET /api/health (public)
    [HttpGet]
    public object Get() => new { status = "ok" };
}
