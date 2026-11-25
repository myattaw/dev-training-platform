package com.pracstack.quotes.pricing;

import com.pracstack.quotes.catalog.Product;
import java.util.Map;
import org.springframework.stereotype.Service;

/** Prices a validated quote request. */
@Service
public class QuoteService {
    private final QuoteBuilder builder;
    private final DiscountPolicy discounts;

    public QuoteService(QuoteBuilder builder, DiscountPolicy discounts) {
        this.builder = builder;
        this.discounts = discounts;
    }

    /** Lines are validated: every product exists, quantities are in range. */
    public Quote price(Iterable<Map.Entry<Product, Integer>> lines) {
        for (Map.Entry<Product, Integer> line : lines) builder.add(line.getKey(), line.getValue());
        return builder.build(discounts);
    }
}
