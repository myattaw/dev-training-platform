using OrderHistory.Services;
using Microsoft.AspNetCore.Mvc;

namespace OrderHistory.Controllers;

[ApiController]
[Route("api/orders")]
public class OrdersController(OrderService orders) : ControllerBase
{
    // GET /api/orders
    // TODO: read the optional query parameters page, pageSize, sort and direction,
    // and answer 400 with { "errors": { parameter: [messages] } } when they are invalid.
    [HttpGet]
    public IActionResult GetPage() =>
        orders.GetPage(null, null, null, null) switch
        {
            PageResult.Found found => Ok(found.Page),
            _ => throw new InvalidOperationException(),
        };
}
