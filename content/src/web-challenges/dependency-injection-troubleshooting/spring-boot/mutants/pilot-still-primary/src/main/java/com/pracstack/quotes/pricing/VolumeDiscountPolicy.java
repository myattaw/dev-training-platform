package com.pracstack.quotes.pricing;

import org.springframework.stereotype.Component;

@Component
public class VolumeDiscountPolicy implements DiscountPolicy {
    @Override
    public long discountFor(long subtotalCents) {
        return subtotalCents >= 10_000 ? subtotalCents / 10 : 0;
    }
}
