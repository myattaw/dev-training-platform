using OrderApi.Data;
using OrderApi.Models;

namespace OrderApi.Services;

/// <summary>Business rules for orders.</summary>
public class OrderService(ShopStore store)
{
    public const decimal DiscountThreshold = 200.00m;
    public const decimal DiscountRate = 0.10m;

    public Order? Find(int id) => store.FindOrder(id);

    public OrderResult Place(CreateOrderRequest request)
    {
        // TODO:
        // 1. Validate: customerId (trimmed, 1-50 characters), at least one line,
        //    every line with a known productId and a quantity from 1 to 100.
        //    Report every invalid field (see OrderResult.Invalid for the shape).
        // 2. Check stock for the whole order (quantities of the same product add up).
        // 3. Compute line totals, subtotal, discount (half-up to 2 places) and total.
        // 4. Reduce stock and store the order, all or nothing.
        throw new NotImplementedException();
    }
}
