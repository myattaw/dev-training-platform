using System.Text.RegularExpressions;
using InventoryApi.Data;
using InventoryApi.Errors;
using InventoryApi.Models;

namespace InventoryApi.Services;

/// <summary>
/// Inventory rules. Failures are reported by throwing NotFoundException,
/// ConflictException or InvalidInputException (see Errors/DomainExceptions.cs).
/// </summary>
public partial class InventoryService(IItemRepository repository, ISupplierClient supplier)
{
    [GeneratedRegex("^[A-Z]{3}-[0-9]{3}$")]
    private static partial Regex SkuPattern();

    public IReadOnlyList<Item> All() => repository.All();

    public Item Get(string sku) =>
        repository.Find(sku) ?? throw new NotFoundException($"Item {sku} was not found.");

    public Item Create(CreateItemRequest request)
    {
        var sku = request.Sku?.Trim() ?? "";
        var name = request.Name?.Trim() ?? "";
        var fields = new Dictionary<string, string[]>();
        if (sku.Length == 0) fields["sku"] = ["SKU is required."];
        else if (!SkuPattern().IsMatch(sku)) fields["sku"] = ["SKU must look like ABC-123."];
        if (name.Length is 0 or > 80) fields["name"] = ["Name is required (1-80 characters)."];
        if (request.Quantity is not (>= 0 and <= 10_000))
            fields["quantity"] = ["Quantity must be a whole number from 0 to 10000."];
        if (fields.Count > 0) throw new InvalidInputException(fields);

        return repository.Atomically(() =>
        {
            if (repository.Find(sku) is not null) throw new ConflictException($"Item {sku} already exists.");
            var item = new Item(sku, name, request.Quantity!.Value);
            repository.Save(item);
            return item;
        });
    }

    public Item Reserve(string sku, ReservationRequest request)
    {
        if (request.Quantity is not >= 1)
        {
            throw new InvalidInputException(new Dictionary<string, string[]>
            {
                ["quantity"] = ["Quantity must be a whole number of at least 1."],
            });
        }
        return repository.Atomically(() =>
        {
            var item = Get(sku);
            if (request.Quantity.Value > item.Quantity)
                throw new ConflictException($"Only {item.Quantity} units of {sku} are in stock.");
            var updated = item with { Quantity = item.Quantity - request.Quantity.Value };
            repository.Save(updated);
            return updated;
        });
    }

    public object SupplierQuote(string sku)
    {
        var item = Get(sku);
        return new { sku = item.Sku, unitPrice = supplier.QuoteUnitPrice(item.Sku) };
    }
}
