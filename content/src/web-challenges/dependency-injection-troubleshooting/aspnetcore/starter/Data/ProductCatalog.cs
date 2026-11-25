using QuoteApi.Models;

namespace QuoteApi.Data;

/// <summary>Read-only product catalog (a singleton).</summary>
public sealed class ProductCatalog
{
    private readonly Dictionary<string, Product> _products = new(StringComparer.Ordinal)
    {
        ["PEN-01"] = new("PEN-01", "Gel pen", 250),
        ["NB-A5"] = new("NB-A5", "Notebook A5", 899),
        ["DESK-LAMP"] = new("DESK-LAMP", "Desk lamp", 4599),
        ["CHAIR-ERG"] = new("CHAIR-ERG", "Ergonomic chair", 18900),
    };

    public Product? Find(string sku) => _products.GetValueOrDefault(sku);
}
