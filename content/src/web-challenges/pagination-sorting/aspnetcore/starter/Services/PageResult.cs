using OrderHistory.Models;

namespace OrderHistory.Services;

/// <summary>The outcome of asking for one page of orders.</summary>
public abstract record PageResult
{
    public sealed record Found(PagedResult<Order> Page) : PageResult;

    /// <summary>Invalid query parameters: parameter name (page, pageSize, sort, direction) → messages.</summary>
    public sealed record Invalid(IDictionary<string, string[]> Errors) : PageResult;
}
