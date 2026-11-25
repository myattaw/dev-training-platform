namespace InventoryApi.Models;

/// <summary>A stocked item, as stored and returned by the API.</summary>
public record Item(string Sku, string Name, int Quantity);

/// <summary>The JSON body of POST /api/items. Any field may be missing (null).</summary>
public record CreateItemRequest(string? Sku, string? Name, int? Quantity);

/// <summary>The JSON body of POST /api/items/{sku}/reservations.</summary>
public record ReservationRequest(int? Quantity);
