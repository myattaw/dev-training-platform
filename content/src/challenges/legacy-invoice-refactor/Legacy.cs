using System.Globalization;

// InvoiceTotals.cs (Billing.Core, 2014). Called by the nightly billing run.
public static class Solution
{
    public static int Processed = 0;
    static decimal disc;
    static string lastCountry = "";

    // invoice = "TYPE|COUNTRY|SKU:QTY:PRICE;SKU:QTY:PRICE"
    // returns one total per invoice ("0.00"), or "ERROR"
    public static string[] BillingRun(string[] invoices)
    {
        var res = new List<string>();
        disc = 0;
        for (int i = 0; i < invoices.Length; i++)
        {
            Processed++;
            string[] p = invoices[i].Split('|');
            if (p.Length != 3) { res.Add("ERROR"); continue; }
            lastCountry = p[1];
            decimal sub = 0;
            bool bad = false;
            string[] ls = p[2].Split(';');
            for (int j = 0; j < ls.Length; j++)
            {
                string[] f = ls[j].Split(':');
                if (f.Length != 3) { bad = true; break; }
                int q;
                decimal pr;
                if (!int.TryParse(f[1], NumberStyles.None, CultureInfo.InvariantCulture, out q)) { bad = true; break; }
                if (!decimal.TryParse(f[2], NumberStyles.AllowDecimalPoint, CultureInfo.InvariantCulture, out pr)) { bad = true; break; }
                if (q <= 0) { bad = true; break; }
                if (q >= 10)
                    sub = sub + q * pr * 0.98m; // bulk
                else
                    sub = sub + q * pr;
            }
            if (bad) { res.Add("ERROR"); continue; }

            if (p[0] == "GOLD")
            {
                if (sub > 100) disc = 0.10m;
            }
            else if (p[0] == "SILVER")
            {
                if (sub > 100) disc = 0.05m;
            }
            else if (p[0] == "STAFF")
            {
                disc = 0.30m;
            }
            decimal after = sub - sub * disc;

            decimal ship = 0;
            if (after < 50)
            {
                if (lastCountry == "NL" || lastCountry == "BE" || lastCountry == "DE") ship = 4.95m;
                else ship = 9.95m;
            }
            // GOLD over 100 ships free (ticket BILL-212)
            if (p[0] == "GOLD")
            {
                if (sub > 100) ship = 0;
            }

            decimal tot;
            if (lastCountry == "NL") tot = (after + ship) * 1.21m;
            else if (lastCountry == "BE") tot = (after + ship) * 1.21m;
            else if (lastCountry == "DE") tot = (after + ship) * 1.19m;
            else tot = after + ship;

            res.Add(Math.Round(tot, 2).ToString("0.00", CultureInfo.InvariantCulture));
        }
        return res.ToArray();
    }
}
