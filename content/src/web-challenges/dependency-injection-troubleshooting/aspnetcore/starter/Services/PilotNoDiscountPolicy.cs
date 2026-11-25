namespace QuoteApi.Services;

/// <summary>
/// Used during last year's pilot, when no discounts were offered. Kept for the
/// pilot's regression tests; not part of the current pricing rules.
/// </summary>
public sealed class PilotNoDiscountPolicy : IDiscountPolicy
{
    public long DiscountFor(long subtotalCents) => 0;
}
