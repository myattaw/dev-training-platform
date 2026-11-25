using Microsoft.AspNetCore.Mvc;
using OrderApi.Models;
using OrderApi.Services;

namespace OrderApi.Controllers;

[ApiController]
[Route("api/orders")]
public class OrdersController(OrderService orders) : ControllerBase
{
    [HttpGet("{id:int}")]
    public ActionResult<Order> GetById(int id) =>
        orders.Find(id) is { } order ? order : NotFound();

    [HttpPost]
    public IActionResult Create(CreateOrderRequest request) =>
        orders.Place(request) switch
        {
            OrderResult.Created created =>
                CreatedAtAction(nameof(GetById), new { id = created.Order.Id }, created.Order),
            OrderResult.Invalid invalid => BadRequest(new { errors = invalid.Errors }),
            OrderResult.InsufficientStock stock => Conflict(new
            {
                message = $"Not enough stock for product {stock.ProductId}.",
                productId = stock.ProductId,
            }),
            _ => throw new InvalidOperationException(),
        };
}
