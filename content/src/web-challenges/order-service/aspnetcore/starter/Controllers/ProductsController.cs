using Microsoft.AspNetCore.Mvc;
using OrderApi.Data;
using OrderApi.Models;

namespace OrderApi.Controllers;

[ApiController]
[Route("api/products")]
public class ProductsController(ShopStore store) : ControllerBase
{
    // GET /api/products
    [HttpGet]
    public IReadOnlyList<Product> GetAll() => store.Products();

    // GET /api/products/{id}
    [HttpGet("{id:int}")]
    public ActionResult<Product> GetById(int id) =>
        store.FindProduct(id) is { } product ? product : NotFound();
}
