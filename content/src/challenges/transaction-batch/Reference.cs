// Reference solution. Private: used only to prove the tests are correct.
using System.Globalization;
using System.Text.RegularExpressions;

public static class Solution
{
    private static readonly string[] Currencies = ["EUR", "GBP", "USD"];
    private static readonly Regex AmountFormat = new(@"^-?[0-9]+(\.[0-9]+)?$", RegexOptions.CultureInvariant);

    public static (int Accepted, Dictionary<string, string> Totals, string[] Errors) ProcessBatch(string[] lines)
    {
        var totals = new SortedDictionary<string, decimal>(StringComparer.Ordinal);
        var seenIds = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var errors = new List<string>();
        var accepted = 0;

        for (var i = 0; i < lines.Length; i++)
        {
            var lineNumber = i + 1;
            if (string.IsNullOrWhiteSpace(lines[i])) continue;

            var error = Validate(lines[i], out var record);
            if (error is null && !seenIds.Add(record.Id)) error = "duplicate-id";
            if (error is not null)
            {
                errors.Add($"{lineNumber}:{error}");
                continue;
            }

            accepted++;
            var key = $"{record.Account}/{record.Currency}";
            totals[key] = totals.GetValueOrDefault(key) + record.Amount;
        }

        var formatted = totals.ToDictionary(
            t => t.Key,
            t => t.Value.ToString("0.00", CultureInfo.InvariantCulture));
        return (accepted, formatted, errors.ToArray());
    }

    private readonly record struct Transaction(string Id, string Account, decimal Amount, string Currency);

    /// <summary>Returns the first rule the line breaks, or null when it is valid.</summary>
    private static string? Validate(string line, out Transaction record)
    {
        record = default;
        var fields = line.Split(',').Select(f => f.Trim()).ToArray();
        if (fields.Length != 5) return "malformed";
        var (id, account, amountText, currencyText, dateText) = (fields[0], fields[1], fields[2], fields[3], fields[4]);

        if (id.Length == 0) return "missing-id";
        if (account.Length == 0) return "missing-account";
        if (!AmountFormat.IsMatch(amountText) ||
            !decimal.TryParse(amountText, NumberStyles.AllowLeadingSign | NumberStyles.AllowDecimalPoint,
                CultureInfo.InvariantCulture, out var amount))
        {
            return "invalid-amount";
        }
        var point = amountText.IndexOf('.');
        if (point >= 0 && amountText.Length - point - 1 > 2) return "too-many-decimals";
        if (amount <= 0) return "non-positive-amount";

        var currency = currencyText.ToUpperInvariant();
        if (!Currencies.Contains(currency)) return "invalid-currency";
        if (!DateOnly.TryParseExact(dateText, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out _))
        {
            return "invalid-date";
        }

        record = new Transaction(id, account, amount, currency);
        return null;
    }
}
