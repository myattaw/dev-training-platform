namespace QuoteApi.Services;

/// <summary>Decides the discount, in cents, for a subtotal in cents.</summary>
public interface IDiscountPolicy
{
    long DiscountFor(long subtotalCents);
}
