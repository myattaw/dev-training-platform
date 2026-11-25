using OrderApi.Models;

namespace OrderApi.Services;

/// <summary>The outcome of placing an order.</summary>
public abstract record OrderResult
{
    public sealed record Created(Order Order) : OrderResult;

    /// <summary>
    /// Invalid input. Keys: "customerId" → messages, and "lines" → either messages
    /// (the list itself is missing or empty) or one error object per submitted
    /// line, in order (an empty object for a valid line), e.g.
    /// [ {}, { "productId": ["Unknown product."] } ].
    /// </summary>
    public sealed record Invalid(IDictionary<string, object> Errors) : OrderResult;

    /// <summary>Not enough stock for this product (the first one in line order).</summary>
    public sealed record InsufficientStock(int ProductId) : OrderResult;
}
