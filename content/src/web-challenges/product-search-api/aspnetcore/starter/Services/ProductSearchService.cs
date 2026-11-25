using ProductCatalog.Data;
using ProductCatalog.Models;

namespace ProductCatalog.Services;

/// <summary>Searches the product catalog.</summary>
public class ProductSearchService(IProductRepository repository)
{
    public Product? Find(int id) => repository.Find(id);

    /// <summary>
    /// Filters the catalog. Every argument is the raw query-string value, or null
    /// when the parameter is missing.
    /// </summary>
    public SearchResult Search(string? q, string? category, string? minPrice, string? maxPrice)
    {
        // TODO: treat missing or blank parameters as "no filter", validate minPrice
        // and maxPrice, then keep only the products that match every filter (by id).
        return new SearchResult.Found(repository.All());
    }
}
