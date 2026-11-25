namespace ProductCatalog.Models;

/// <summary>A product as stored and returned by the API. Prices have two decimal places.</summary>
public record Product(int Id, string Name, string Category, decimal Price, bool InStock);
