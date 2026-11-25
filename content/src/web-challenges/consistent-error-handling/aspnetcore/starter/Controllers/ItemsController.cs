using InventoryApi.Models;
using InventoryApi.Services;
using Microsoft.AspNetCore.Mvc;

namespace InventoryApi.Controllers;

/// <summary>
/// The HTTP layer only maps requests to the service. It does not catch
/// exceptions: errors are turned into responses in one central place.
/// </summary>
[ApiController]
[Route("api/items")]
public class ItemsController(InventoryService inventory) : ControllerBase
{
    [HttpGet]
    public IReadOnlyList<Item> GetAll() => inventory.All();

    [HttpGet("{sku}")]
    public Item Get(string sku) => inventory.Get(sku);

    [HttpPost]
    public IActionResult Create(CreateItemRequest request)
    {
        var item = inventory.Create(request);
        return Created($"/api/items/{item.Sku}", item);
    }

    [HttpPost("{sku}/reservations")]
    public Item Reserve(string sku, ReservationRequest request) => inventory.Reserve(sku, request);

    [HttpGet("{sku}/supplier-quote")]
    public object SupplierQuote(string sku) => inventory.SupplierQuote(sku);
}
