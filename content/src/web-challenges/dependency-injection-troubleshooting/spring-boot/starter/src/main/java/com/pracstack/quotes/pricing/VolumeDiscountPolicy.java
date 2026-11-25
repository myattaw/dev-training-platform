package com.pracstack.quotes.pricing;

import org.springframework.stereotype.Component;

/**
 * The current pricing rule: 10% off when the subtotal is at least $100.00
 * (10000 cents), rounded down to a whole cent.
 */
@Component
public class VolumeDiscountPolicy implements DiscountPolicy {
    @Override
    public long discountFor(long subtotalCents) {
        return subtotalCents >= 10_000 ? subtotalCents / 10 : 0;
    }
}
