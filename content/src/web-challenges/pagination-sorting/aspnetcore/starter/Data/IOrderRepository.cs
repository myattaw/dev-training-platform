using OrderHistory.Models;

namespace OrderHistory.Data;

/// <summary>Read-only access to the order history.</summary>
public interface IOrderRepository
{
    /// <summary>Every order, in no guaranteed order.</summary>
    IReadOnlyList<Order> All();
}
