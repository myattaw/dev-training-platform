using InventoryApi.Models;

namespace InventoryApi.Data;

/// <summary>Stores items by SKU.</summary>
public interface IItemRepository
{
    IReadOnlyList<Item> All();

    Item? Find(string sku);

    void Save(Item item);

    /// <summary>Runs <paramref name="action"/> while no other change can happen.</summary>
    T Atomically<T>(Func<T> action);
}

/// <summary>
/// In-memory storage, seeded with three items. Registered as a singleton, so data
/// lives as long as the application. Thread-safe.
/// </summary>
public sealed class InMemoryItemRepository : IItemRepository
{
    private readonly object _gate = new();
    private readonly Dictionary<string, Item> _items = new(StringComparer.Ordinal)
    {
        ["KBD-101"] = new("KBD-101", "Mechanical keyboard", 25),
        ["MON-202"] = new("MON-202", "27-inch monitor", 8),
        ["CBL-303"] = new("CBL-303", "USB-C cable", 140),
    };

    public IReadOnlyList<Item> All()
    {
        lock (_gate) return _items.Values.OrderBy(i => i.Sku, StringComparer.Ordinal).ToList();
    }

    public Item? Find(string sku)
    {
        lock (_gate) return _items.GetValueOrDefault(sku);
    }

    public void Save(Item item)
    {
        lock (_gate) _items[item.Sku] = item;
    }

    public T Atomically<T>(Func<T> action)
    {
        lock (_gate) return action();
    }
}
