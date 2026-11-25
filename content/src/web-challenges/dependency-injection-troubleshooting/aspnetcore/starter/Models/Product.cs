namespace QuoteApi.Models;

/// <summary>A catalog product. Prices are in cents.</summary>
public sealed record Product(string Sku, string Name, long UnitPriceCents);
