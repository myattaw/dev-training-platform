using Microsoft.AspNetCore.Mvc;
using OrderApi.Models;
using OrderApi.Services;

namespace OrderApi.Controllers;

[ApiController]
[Route("api/orders")]
public class OrdersController(OrderService orders) : ControllerBase
{
    // TODO: GET /api/orders/{id}: 200 with the order, or 404.

    // TODO: POST /api/orders: 201 with a Location header and the order,
    // 400 with { "errors": { ... } } for invalid input,
    // 409 with { "message", "productId" } when a product does not have enough stock.
}
