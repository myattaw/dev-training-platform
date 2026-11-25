using Microsoft.AspNetCore.Mvc;

namespace QuoteApi.Controllers;

[ApiController]
[Route("api/health")]
public class HealthController : ControllerBase
{
    // GET /api/health
    [HttpGet]
    public object Get() => new { status = "ok" };
}
