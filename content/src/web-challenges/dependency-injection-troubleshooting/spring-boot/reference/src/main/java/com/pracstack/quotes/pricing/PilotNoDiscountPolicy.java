package com.pracstack.quotes.pricing;

import org.springframework.stereotype.Component;

/**
 * Used during last year's pilot, when no discounts were offered. Kept for the
 * pilot's regression tests (inject it with @Qualifier("pilotNoDiscountPolicy"));
 * not part of the current pricing rules.
 */
@Component
public class PilotNoDiscountPolicy implements DiscountPolicy {
    @Override
    public long discountFor(long subtotalCents) {
        return 0;
    }
}
