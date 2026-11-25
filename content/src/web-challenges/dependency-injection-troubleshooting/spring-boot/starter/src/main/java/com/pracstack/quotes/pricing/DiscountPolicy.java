package com.pracstack.quotes.pricing;

/** Decides the discount, in cents, for a subtotal in cents. */
public interface DiscountPolicy {
    long discountFor(long subtotalCents);
}
