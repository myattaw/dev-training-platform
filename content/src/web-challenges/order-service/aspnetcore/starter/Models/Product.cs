namespace OrderApi.Models;

/// <summary>A product as stored and returned by the API. Prices are exact decimals.</summary>
public record Product(int Id, string Name, decimal UnitPrice, int Stock);
