namespace InventoryApi.Services;

/// <summary>Asks the supplier for a restocking quote.</summary>
public interface ISupplierClient
{
    decimal QuoteUnitPrice(string sku);
}

/// <summary>
/// The supplier gateway is not reachable from this environment, so every call
/// fails the way a real outage would: with an internal error whose details must
/// stay on the server.
/// </summary>
public sealed class SupplierGatewayClient : ISupplierClient
{
    public decimal QuoteUnitPrice(string sku) =>
        throw new HttpRequestException(
            $"Connection refused (supplier-gateway.internal:8443) while requesting /v2/quotes/{sku}");
}
