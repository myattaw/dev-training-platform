using System.Globalization;
using System.Text.RegularExpressions;
using OrderHistory.Data;
using OrderHistory.Models;

namespace OrderHistory.Services;

/// <summary>Pages through the order history.</summary>
public class OrderService(IOrderRepository repository)
{
    public const int DefaultPageSize = 10;
    public const int MaxPageSize = 50;
    public static readonly string[] SortFields = ["id", "customer", "total", "orderDate"];

    private static readonly Regex WholeNumber = new(@"^-?[0-9]+$");

    /// <summary>
    /// One page of orders. Every argument is the raw query-string value, or null
    /// when the parameter is missing.
    /// </summary>
    public PageResult GetPage(string? page, string? pageSize, string? sort, string? direction)
    {
        var errors = new Dictionary<string, string[]>();
        var pageNumber = ParseNumber("page", page, 1, 1, int.MaxValue, errors);
        var size = ParseNumber("pageSize", pageSize, DefaultPageSize, 1, MaxPageSize, errors);
        var field = Clean(sort) ?? "id";
        if (!SortFields.Contains(field))
            errors["sort"] = [$"sort must be one of: {string.Join(", ", SortFields)}."];
        var order = Clean(direction) ?? "asc";
        if (order is not ("asc" or "desc"))
            errors["direction"] = ["direction must be asc or desc."];
        if (errors.Count > 0) return new PageResult.Invalid(errors);

        var descending = order == "desc";
        var all = repository.All();
        var sorted = field switch
        {
            "customer" => By(all, o => o.Customer, descending),
            "total" => By(all, o => o.Total, descending),
            "orderDate" => By(all, o => o.OrderDate, descending),
            _ => By(all, o => o.Id, descending),
        };
        var skip = (long)(pageNumber - 1) * size;
        var items = skip >= all.Count
            ? new List<Order>()
            : (descending ? sorted.ThenByDescending(o => o.Id) : sorted.ThenBy(o => o.Id)).Skip((int)skip).Take(size).ToList();
        var totalPages = (all.Count + size - 1) / size;
        return new PageResult.Found(new PagedResult<Order>(items, pageNumber, size, all.Count, totalPages));
    }

    private static IOrderedEnumerable<Order> By<TKey>(
        IEnumerable<Order> orders, Func<Order, TKey> key, bool descending) =>
        descending
            ? orders.OrderByDescending(key, Comparer<TKey>.Default)
            : orders.OrderBy(key, Comparer<TKey>.Default);

    /// <summary>Trims a value; a blank value counts as missing (null).</summary>
    private static string? Clean(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private static int ParseNumber(
        string name, string? raw, int fallback, int min, int max, Dictionary<string, string[]> errors)
    {
        var text = Clean(raw);
        if (text is null) return fallback;
        if (!WholeNumber.IsMatch(text) ||
            !int.TryParse(text, NumberStyles.AllowLeadingSign, CultureInfo.InvariantCulture, out var value) ||
            value < min || value > max)
        {
            errors[name] = [max == int.MaxValue
                ? $"{name} must be a whole number of at least {min}."
                : $"{name} must be a whole number from {min} to {max}."];
            return fallback;
        }
        return value;
    }
}
