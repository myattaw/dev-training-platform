namespace QuoteApi.Models;

/// <summary>Body of POST /api/quotes.</summary>
public sealed record QuoteRequest(List<QuoteLineRequest>? Lines);

public sealed record QuoteLineRequest(string? Sku, int Quantity);
