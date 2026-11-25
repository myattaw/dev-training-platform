using OrderApi.Models;

namespace OrderApi.Data;

/// <summary>
/// In-memory storage for products and orders (a singleton), seeded with the
/// product catalog. Every method locks <see cref="Gate"/>. To check and change
/// several products as one atomic step, hold the same lock around the whole
/// step: <c>lock (store.Gate) { ... }</c> (the lock is re-entrant).
/// </summary>
public sealed class ShopStore
{
    public object Gate { get; } = new();

    private readonly Dictionary<int, Product> _products = new()
    {
        [1] = new(1, "USB-C Cable", 19.99m, 500),
        [2] = new(2, "Cable Tie", 0.10m, 1000),
        [3] = new(3, "Notebook", 50.00m, 200),
        [4] = new(4, "Monitor Arm", 199.99m, 100),
        [5] = new(5, "Limited Edition Mouse", 35.00m, 3),
        [6] = new(6, "Webcam", 64.95m, 40),
        [7] = new(7, "Laptop Stand", 45.50m, 10),
        [8] = new(8, "Desk Mat", 24.99m, 5),
    };
    private readonly Dictionary<int, Order> _orders = [];
    private int _nextOrderId = 1;

    public IReadOnlyList<Product> Products()
    {
        lock (Gate) return _products.Values.OrderBy(p => p.Id).ToList();
    }

    public Product? FindProduct(int id)
    {
        lock (Gate) return _products.GetValueOrDefault(id);
    }

    /// <summary>Sets the stock of an existing product.</summary>
    public void SetStock(int productId, int stock)
    {
        lock (Gate) _products[productId] = _products[productId] with { Stock = stock };
    }

    /// <summary>Stores a new order with the next id and returns it.</summary>
    public Order AddOrder(
        string customerId, IReadOnlyList<OrderLine> lines, decimal subtotal, decimal discount, decimal total)
    {
        lock (Gate)
        {
            var order = new Order(_nextOrderId++, customerId, lines, subtotal, discount, total);
            _orders[order.Id] = order;
            return order;
        }
    }

    public Order? FindOrder(int id)
    {
        lock (Gate) return _orders.GetValueOrDefault(id);
    }
}
