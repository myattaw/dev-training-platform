using System.Globalization;
using System.Text.RegularExpressions;
using ProductCatalog.Data;
using ProductCatalog.Models;

namespace ProductCatalog.Services;

/// <summary>Searches the product catalog.</summary>
public class ProductSearchService(IProductRepository repository)
{
    private static readonly Regex DecimalNumber = new(@"^-?[0-9]+(\.[0-9]+)?$");

    public Product? Find(int id) => repository.Find(id);

    /// <summary>
    /// Filters the catalog. Every argument is the raw query-string value, or null
    /// when the parameter is missing.
    /// </summary>
    public SearchResult Search(string? q, string? category, string? minPrice, string? maxPrice)
    {
        var errors = new Dictionary<string, string[]>();
        var min = ParsePrice("minPrice", minPrice, errors);
        var max = ParsePrice("maxPrice", maxPrice, errors);
        if (min is not null && max is not null && min > max)
            errors["maxPrice"] = ["maxPrice must be greater than or equal to minPrice."];
        if (errors.Count > 0) return new SearchResult.Invalid(errors);

        var text = Clean(q);
        var exactCategory = Clean(category);
        IEnumerable<Product> results = repository.All();
        if (text is not null)
            results = results.Where(p => p.Name.Contains(text, StringComparison.OrdinalIgnoreCase));
        if (exactCategory is not null)
            results = results.Where(p => p.Category == exactCategory);
        if (min is not null) results = results.Where(p => p.Price > min);
        if (max is not null) results = results.Where(p => p.Price < max);
        return new SearchResult.Found(results.OrderBy(p => p.Id).ToList());
    }

    /// <summary>Trims a value; a blank value counts as missing (null).</summary>
    private static string? Clean(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private static decimal? ParsePrice(string name, string? raw, Dictionary<string, string[]> errors)
    {
        var text = Clean(raw);
        if (text is null) return null;
        if (!DecimalNumber.IsMatch(text) ||
            !decimal.TryParse(text, NumberStyles.AllowLeadingSign | NumberStyles.AllowDecimalPoint,
                CultureInfo.InvariantCulture, out var value))
        {
            errors[name] = [$"{name} must be a number."];
            return null;
        }
        if (value < 0)
        {
            errors[name] = [$"{name} must not be negative."];
            return null;
        }
        return value;
    }
}
