using Microsoft.AspNetCore.Mvc;
using QuoteApi.Data;
using QuoteApi.Models;
using QuoteApi.Services;

namespace QuoteApi.Controllers;

[ApiController]
[Route("api/quotes")]
public class QuotesController(ProductCatalog catalog, QuoteService quotes) : ControllerBase
{
    // POST /api/quotes
    [HttpPost]
    public IActionResult Create(QuoteRequest request)
    {
        var errors = new List<string>();
        var lines = new List<(Product, int)>();
        if (request.Lines is null || request.Lines.Count == 0)
            errors.Add("At least one line is required.");
        foreach (var line in request.Lines ?? [])
        {
            var product = line.Sku is null ? null : catalog.Find(line.Sku);
            if (product is null) errors.Add($"Unknown product \"{line.Sku}\".");
            else if (line.Quantity < 1 || line.Quantity > 999)
                errors.Add($"Quantity for {line.Sku} must be between 1 and 999.");
            else lines.Add((product, line.Quantity));
        }
        if (errors.Count > 0)
        {
            return BadRequest(new
            {
                errors = new Dictionary<string, List<string>> { ["lines"] = errors },
            });
        }
        return Ok(quotes.Price(lines));
    }
}
