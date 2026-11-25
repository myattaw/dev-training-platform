package com.pracstack.quotes.pricing;

import com.pracstack.quotes.catalog.Product;
import java.util.Map;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Service;

/** Prices a validated quote request. */
@Service
public class QuoteService {
    // QuoteService is a singleton: injecting a prototype directly would create ONE
    // builder when this service is created and share it forever. Ask the provider
    // for a fresh builder for every quote instead.
    private final ObjectProvider<QuoteBuilder> builders;
    private final DiscountPolicy discounts;

    public QuoteService(ObjectProvider<QuoteBuilder> builders, DiscountPolicy discounts) {
        this.builders = builders;
        this.discounts = discounts;
    }

    /** Lines are validated: every product exists, quantities are in range. */
    public Quote price(Iterable<Map.Entry<Product, Integer>> lines) {
        QuoteBuilder builder = builders.getObject();
        for (Map.Entry<Product, Integer> line : lines) builder.add(line.getKey(), line.getValue());
        return builder.build(discounts);
    }
}
