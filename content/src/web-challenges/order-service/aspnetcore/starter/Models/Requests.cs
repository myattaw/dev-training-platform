namespace OrderApi.Models;

/// <summary>The JSON body of POST /api/orders. Any field may be missing (null).</summary>
public record CreateOrderRequest(string? CustomerId, List<OrderLineRequest?>? Lines);

/// <summary>One requested line. Any field may be missing (null).</summary>
public record OrderLineRequest(int? ProductId, int? Quantity);
