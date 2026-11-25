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
        var customerId = request.CustomerId?.Trim() ?? "";
        var errors = new Dictionary<string, object>();
        if (customerId.Length is 0 or > 50)
            errors["customerId"] = new[] { "Customer id is required (1-50 characters)." };

        var lines = request.Lines ?? [];
        if (lines.Count == 0)
        {
            errors["lines"] = new[] { "An order needs at least one line." };
        }
        else
        {
            var lineErrors = new List<Dictionary<string, string[]>>();
            foreach (var line in lines)
            {
                var lineError = new Dictionary<string, string[]>();
                if (line?.ProductId is not { } productId || store.FindProduct(productId) is null)
                    lineError["productId"] = ["Unknown product."];
                if (line?.Quantity is not (>= 1 and <= 100))
                    lineError["quantity"] = ["Quantity must be from 1 to 100."];
                lineErrors.Add(lineError);
            }
            if (lineErrors.Any(e => e.Count > 0)) errors["lines"] = lineErrors;
        }
        if (errors.Count > 0) return new OrderResult.Invalid(errors);

        var requested = lines.Select(l => (ProductId: l!.ProductId!.Value, Quantity: l.Quantity!.Value)).ToList();
        lock (store.Gate)
        {
            // Check the whole order first: quantities of the same product add up.
            var needed = new Dictionary<int, int>();
            foreach (var (productId, quantity) in requested)
                needed[productId] = needed.GetValueOrDefault(productId) + quantity;
            foreach (var (productId, quantity) in requested)
            {
                var product = store.FindProduct(productId)!;
                if (product.Stock < quantity)
                    return new OrderResult.InsufficientStock(productId);
                store.SetStock(productId, product.Stock - quantity);
            }

            var orderLines = requested
                .Select(r =>
                {
                    var product = store.FindProduct(r.ProductId)!;
                    return new OrderLine(product.Id, product.Name, r.Quantity, product.UnitPrice,
                        product.UnitPrice * r.Quantity);
                })
                .ToList();
            var subtotal = orderLines.Sum(l => l.LineTotal);
            var discount = subtotal >= DiscountThreshold
                ? Math.Round(subtotal * DiscountRate, 2, MidpointRounding.AwayFromZero)
                : 0.00m;
            var total = subtotal - discount;

            // Only now change anything: every check has passed.
            return new OrderResult.Created(store.AddOrder(customerId, orderLines, subtotal, discount, total));
        }
    }
}
