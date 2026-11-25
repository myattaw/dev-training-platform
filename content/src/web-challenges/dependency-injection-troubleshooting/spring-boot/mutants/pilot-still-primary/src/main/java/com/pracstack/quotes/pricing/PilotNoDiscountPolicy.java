package com.pracstack.quotes.pricing;

import org.springframework.context.annotation.Primary;
import org.springframework.stereotype.Component;

/** Wrong: still the primary candidate. */
@Primary
@Component
public class PilotNoDiscountPolicy implements DiscountPolicy {
    @Override
    public long discountFor(long subtotalCents) {
        return 0;
    }
}
