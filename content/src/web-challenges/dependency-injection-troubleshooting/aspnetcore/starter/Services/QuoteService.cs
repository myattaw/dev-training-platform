using QuoteApi.Models;

namespace QuoteApi.Services;

/// <summary>Prices a validated quote request.</summary>
public sealed class QuoteService(QuoteBuilder builder, IDiscountPolicy discounts)
{
    /// <param name="lines">Validated lines: every product exists, quantities are in range.</param>
    public Quote Price(IEnumerable<(Product Product, int Quantity)> lines)
    {
        foreach (var (product, quantity) in lines) builder.Add(product, quantity);
        return builder.Build(discounts);
    }
}
