using ProductCatalog.Models;
using ProductCatalog.Services;
using Microsoft.AspNetCore.Mvc;

namespace ProductCatalog.Controllers;

[ApiController]
[Route("api/products")]
public class ProductsController(ProductSearchService products) : ControllerBase
{
    // GET /api/products?q=&category=&minPrice=&maxPrice=
    [HttpGet]
    public IActionResult Search(
        [FromQuery] string? q,
        [FromQuery] string? category,
        [FromQuery] string? minPrice,
        [FromQuery] string? maxPrice) =>
        products.Search(q, category, minPrice, maxPrice) switch
        {
            SearchResult.Found found => Ok(found.Products),
            SearchResult.Invalid invalid => BadRequest(new { errors = invalid.Errors }),
            _ => throw new InvalidOperationException(),
        };

    [HttpGet("{id:int}")]
    public ActionResult<Product> GetById(int id) =>
        products.Find(id) is { } product ? product : NotFound();
}
