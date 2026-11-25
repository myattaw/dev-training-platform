using OrderHistory.Models;

namespace OrderHistory.Data;

/// <summary>The order history, seeded with 25 orders. It never changes while the application runs.</summary>
public sealed class InMemoryOrderRepository : IOrderRepository
{
    private static readonly IReadOnlyList<Order> Orders =
    [
        new(1, "Olivia Brown", 120.00m, new DateOnly(2026, 3, 2), "Delivered"),
        new(2, "Liam Smith", 45.50m, new DateOnly(2026, 3, 1), "Delivered"),
        new(3, "Emma Johnson", 89.99m, new DateOnly(2026, 3, 5), "Shipped"),
        new(4, "Noah Williams", 45.50m, new DateOnly(2026, 3, 3), "Delivered"),
        new(5, "Ava Jones", 210.00m, new DateOnly(2026, 3, 1), "Pending"),
        new(6, "Olivia Brown", 15.25m, new DateOnly(2026, 3, 7), "Shipped"),
        new(7, "Mason Garcia", 89.99m, new DateOnly(2026, 3, 4), "Delivered"),
        new(8, "Sophia Miller", 300.00m, new DateOnly(2026, 3, 6), "Pending"),
        new(9, "Liam Smith", 45.50m, new DateOnly(2026, 3, 2), "Shipped"),
        new(10, "Isabella Davis", 72.40m, new DateOnly(2026, 3, 8), "Delivered"),
        new(11, "Ethan Martinez", 19.99m, new DateOnly(2026, 3, 5), "Pending"),
        new(12, "Emma Johnson", 150.00m, new DateOnly(2026, 3, 9), "Delivered"),
        new(13, "Lucas Wilson", 89.99m, new DateOnly(2026, 3, 1), "Shipped"),
        new(14, "Mia Anderson", 64.00m, new DateOnly(2026, 3, 10), "Delivered"),
        new(15, "Ava Jones", 15.25m, new DateOnly(2026, 3, 3), "Pending"),
        new(16, "Logan Thomas", 99.00m, new DateOnly(2026, 3, 11), "Shipped"),
        new(17, "Charlotte Moore", 45.50m, new DateOnly(2026, 3, 12), "Delivered"),
        new(18, "Olivia Brown", 250.75m, new DateOnly(2026, 3, 6), "Pending"),
        new(19, "James Taylor", 33.10m, new DateOnly(2026, 3, 13), "Shipped"),
        new(20, "Amelia White", 120.00m, new DateOnly(2026, 3, 4), "Delivered"),
        new(21, "Liam Smith", 8.99m, new DateOnly(2026, 3, 14), "Pending"),
        new(22, "Harper Clark", 175.20m, new DateOnly(2026, 3, 10), "Shipped"),
        new(23, "Benjamin Lee", 120.00m, new DateOnly(2026, 3, 15), "Delivered"),
        new(24, "Evelyn Hall", 60.00m, new DateOnly(2026, 3, 12), "Pending"),
        new(25, "Emma Johnson", 300.00m, new DateOnly(2026, 3, 15), "Shipped"),
    ];

    public IReadOnlyList<Order> All() => Orders;
}
