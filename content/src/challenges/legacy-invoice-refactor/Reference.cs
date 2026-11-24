// Reference solution. Private: used only to prove the tests are correct.
using System.Globalization;

public static class Solution
{
    /// <summary>Totals the invoices of one billing run (one total per invoice, or "ERROR").</summary>
    public static string[] BillingRun(string[] invoices) =>
        invoices.Select(invoice => Invoice.TryParse(invoice) is { } parsed ? Format(parsed.Total()) : Error).ToArray();

    private const string Error = "ERROR";

    // Existing behavior: banker's rounding (Math.Round's default), kept on purpose.
    private static string Format(decimal total) =>
        Math.Round(total, 2).ToString("0.00", CultureInfo.InvariantCulture);
}

internal sealed record InvoiceLine(int Quantity, decimal UnitPrice)
{
    private const int BulkQuantity = 10;
    private const decimal BulkRate = 0.02m;

    public decimal Amount => Quantity >= BulkQuantity
        ? Quantity * UnitPrice * (1 - BulkRate)
        : Quantity * UnitPrice;
}

internal sealed record Invoice(string CustomerType, string Country, IReadOnlyList<InvoiceLine> Lines)
{
    private const decimal DiscountThreshold = 100m;
    private const decimal FreeShippingFrom = 50m;
    private const decimal DomesticShipping = 4.95m;
    private const decimal InternationalShipping = 9.95m;

    private static readonly Dictionary<string, decimal> VatRates = new()
    {
        ["NL"] = 0.21m,
        ["BE"] = 0.21m,
        ["DE"] = 0.19m,
    };

    public static Invoice? TryParse(string text)
    {
        var parts = text.Split('|');
        if (parts.Length != 3) return null;
        var lines = new List<InvoiceLine>();
        foreach (var item in parts[2].Split(';'))
        {
            var fields = item.Split(':');
            if (fields.Length != 3) return null;
            if (!int.TryParse(fields[1], NumberStyles.None, CultureInfo.InvariantCulture, out var quantity)) return null;
            if (!decimal.TryParse(fields[2], NumberStyles.AllowDecimalPoint, CultureInfo.InvariantCulture, out var price)) return null;
            if (quantity <= 0) return null;
            lines.Add(new InvoiceLine(quantity, price));
        }
        return new Invoice(parts[0], parts[1], lines);
    }

    public decimal Total()
    {
        var subtotal = Lines.Sum(l => l.Amount);
        var discounted = subtotal - subtotal * DiscountRate(subtotal);
        var shipping = discounted >= FreeShippingFrom ? 0m
            : VatRates.ContainsKey(Country) ? DomesticShipping
            : InternationalShipping;
        return (discounted + shipping) * (1 + VatRates.GetValueOrDefault(Country));
    }

    /// <summary>Depends only on this invoice (fixes INV-4521: discounts carried over between invoices).</summary>
    private decimal DiscountRate(decimal subtotal) => CustomerType switch
    {
        "STAFF" => 0.30m,
        "GOLD" when subtotal > DiscountThreshold => 0.10m,
        "SILVER" when subtotal > DiscountThreshold => 0.05m,
        _ => 0m,
    };
}
