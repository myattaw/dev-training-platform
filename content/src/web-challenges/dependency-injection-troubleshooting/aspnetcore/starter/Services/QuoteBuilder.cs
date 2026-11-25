using QuoteApi.Models;

namespace QuoteApi.Services;

/// <summary>
/// Collects the lines of ONE quote. It keeps state, so every quote needs its
/// own builder: it must never be shared between requests.
/// </summary>
public sealed class QuoteBuilder
{
    private readonly List<QuoteLine> _lines = [];

    public void Add(Product product, int quantity) =>
        _lines.Add(new QuoteLine(product.Sku, quantity, product.UnitPriceCents,
            product.UnitPriceCents * quantity));

    public Quote Build(IDiscountPolicy discounts)
    {
        var subtotal = _lines.Sum(l => l.LineTotalCents);
        var discount = discounts.DiscountFor(subtotal);
        return new Quote(_lines.ToList(), subtotal, discount, subtotal - discount);
    }
}
