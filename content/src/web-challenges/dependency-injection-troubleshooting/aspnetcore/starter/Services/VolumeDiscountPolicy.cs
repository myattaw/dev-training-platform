namespace QuoteApi.Services;

/// <summary>
/// The current pricing rule: 10% off when the subtotal is at least $100.00
/// (10000 cents), rounded down to a whole cent.
/// </summary>
public sealed class VolumeDiscountPolicy : IDiscountPolicy
{
    public long DiscountFor(long subtotalCents) =>
        subtotalCents >= 10_000 ? subtotalCents / 10 : 0;
}
