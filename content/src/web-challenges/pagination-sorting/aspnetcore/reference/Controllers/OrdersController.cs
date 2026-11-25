using OrderHistory.Services;
using Microsoft.AspNetCore.Mvc;

namespace OrderHistory.Controllers;

[ApiController]
[Route("api/orders")]
public class OrdersController(OrderService orders) : ControllerBase
{
    // GET /api/orders?page=&pageSize=&sort=&direction=
    [HttpGet]
    public IActionResult GetPage(
        [FromQuery] string? page,
        [FromQuery] string? pageSize,
        [FromQuery] string? sort,
        [FromQuery] string? direction) =>
        orders.GetPage(page, pageSize, sort, direction) switch
        {
            PageResult.Found found => Ok(found.Page),
            PageResult.Invalid invalid => BadRequest(new { errors = invalid.Errors }),
            _ => throw new InvalidOperationException(),
        };
}
