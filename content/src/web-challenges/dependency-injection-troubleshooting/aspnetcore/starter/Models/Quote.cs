namespace QuoteApi.Models;

/// <summary>A priced quote. All amounts are in cents.</summary>
public sealed record Quote(
    IReadOnlyList<QuoteLine> Lines,
    long SubtotalCents,
    long DiscountCents,
    long TotalCents);

public sealed record QuoteLine(string Sku, int Quantity, long UnitPriceCents, long LineTotalCents);
