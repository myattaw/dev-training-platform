using ProductCatalog.Services;
using Microsoft.AspNetCore.Mvc;

namespace ProductCatalog.Controllers;

[ApiController]
[Route("api/products")]
public class ProductsController(ProductSearchService products) : ControllerBase
{
    // GET /api/products
    // TODO: read the optional query parameters q, category, minPrice and maxPrice,
    // and answer 400 with { "errors": { parameter: [messages] } } when they are invalid.
    [HttpGet]
    public IActionResult Search() =>
        products.Search(null, null, null, null) switch
        {
            SearchResult.Found found => Ok(found.Products),
            _ => throw new InvalidOperationException(),
        };

    // TODO: GET /api/products/{id}: 200 with the product, or 404.
}
