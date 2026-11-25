using ProductCatalog.Models;

namespace ProductCatalog.Data;

/// <summary>Read-only access to the product catalog.</summary>
public interface IProductRepository
{
    /// <summary>Every product, ordered by id.</summary>
    IReadOnlyList<Product> All();

    Product? Find(int id);
}
