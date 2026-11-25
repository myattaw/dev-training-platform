namespace OrderApi.Models;

/// <summary>An order as stored and returned by the API. Amounts have 2 decimal places.</summary>
public record Order(
    int Id,
    string CustomerId,
    IReadOnlyList<OrderLine> Lines,
    decimal Subtotal,
    decimal Discount,
    decimal Total);

/// <summary>One line of an order: the product, its price at the time of the order, and the line total.</summary>
public record OrderLine(int ProductId, string ProductName, int Quantity, decimal UnitPrice, decimal LineTotal);
