package com.pracstack.quotes.pricing;

import org.springframework.context.annotation.Primary;
import org.springframework.stereotype.Component;

/**
 * Used during last year's pilot, when no discounts were offered. Kept for the
 * pilot's regression tests; not part of the current pricing rules.
 */
// TODO (support ticket): large orders never get the volume discount.
@Primary
@Component
public class PilotNoDiscountPolicy implements DiscountPolicy {
    @Override
    public long discountFor(long subtotalCents) {
        return 0;
    }
}
