using OrderHistory.Data;
using OrderHistory.Models;

namespace OrderHistory.Services;

/// <summary>Pages through the order history.</summary>
public class OrderService(IOrderRepository repository)
{
    public const int DefaultPageSize = 10;
    public const int MaxPageSize = 50;
    public static readonly string[] SortFields = ["id", "customer", "total", "orderDate"];

    /// <summary>
    /// One page of orders. Every argument is the raw query-string value, or null
    /// when the parameter is missing.
    /// </summary>
    public PageResult GetPage(string? page, string? pageSize, string? sort, string? direction)
    {
        // TODO: apply the defaults, validate the four parameters, sort with id as the
        // tie-breaker, then take the requested page and compute the totals.
        // For now: always the first ten orders by id, with placeholder totals.
        var all = repository.All();
        var first = all.OrderBy(o => o.Id).Take(DefaultPageSize).ToList();
        return new PageResult.Found(new PagedResult<Order>(first, 1, DefaultPageSize, all.Count, 1));
    }
}
