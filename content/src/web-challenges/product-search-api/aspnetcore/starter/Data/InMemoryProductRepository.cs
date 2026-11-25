using ProductCatalog.Models;

namespace ProductCatalog.Data;

/// <summary>The catalog, seeded with fifteen products. It never changes while the application runs.</summary>
public sealed class InMemoryProductRepository : IProductRepository
{
    private static readonly IReadOnlyList<Product> Products =
    [
        new(1, "Wireless Mouse", "Electronics", 24.99m, true),
        new(2, "Mechanical Keyboard", "Electronics", 89.00m, true),
        new(3, "USB-C Hub", "Electronics", 39.50m, false),
        new(4, "Noise Cancelling Headphones", "Electronics", 199.99m, true),
        new(5, "Desk Lamp", "Office", 34.95m, true),
        new(6, "Ergonomic Office Chair", "Office", 249.00m, false),
        new(7, "Standing Desk Mat", "Office", 19.99m, true),
        new(8, "Notebook Set", "Office", 12.50m, true),
        new(9, "Chef Knife", "Kitchen", 59.90m, true),
        new(10, "Cast Iron Skillet", "Kitchen", 44.00m, true),
        new(11, "Coffee Grinder", "Kitchen", 19.99m, false),
        new(12, "Camping Lantern", "Outdoor", 29.99m, true),
        new(13, "Hiking Backpack", "Outdoor", 119.00m, true),
        new(14, "Water Bottle", "Outdoor", 15.00m, true),
        new(15, "Lamp Oil Refill", "Outdoor", 9.99m, true),
    ];

    public IReadOnlyList<Product> All() => Products;

    public Product? Find(int id) => Products.FirstOrDefault(p => p.Id == id);
}
