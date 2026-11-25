using ProductCatalog.Models;

namespace ProductCatalog.Services;

/// <summary>The outcome of a product search.</summary>
public abstract record SearchResult
{
    /// <summary>The matching products, ordered by id (possibly none).</summary>
    public sealed record Found(IReadOnlyList<Product> Products) : SearchResult;

    /// <summary>Invalid query parameters: parameter name (minPrice, maxPrice) → messages.</summary>
    public sealed record Invalid(IDictionary<string, string[]> Errors) : SearchResult;
}
