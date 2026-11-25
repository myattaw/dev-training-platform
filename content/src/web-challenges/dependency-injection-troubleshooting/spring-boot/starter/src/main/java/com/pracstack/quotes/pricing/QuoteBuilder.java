package com.pracstack.quotes.pricing;

import com.pracstack.quotes.catalog.Product;
import java.util.ArrayList;
import java.util.List;
import org.springframework.stereotype.Component;

/**
 * Collects the lines of ONE quote. It keeps state, so every quote needs its
 * own builder: it must never be shared between requests.
 */
// TODO (support ticket): a second quote "remembers" the lines of earlier quotes.
@Component
public class QuoteBuilder {
    private final List<QuoteLine> lines = new ArrayList<>();

    public void add(Product product, int quantity) {
        lines.add(new QuoteLine(product.sku(), quantity, product.unitPriceCents(),
                product.unitPriceCents() * quantity));
    }

    public Quote build(DiscountPolicy discounts) {
        long subtotal = lines.stream().mapToLong(QuoteLine::lineTotalCents).sum();
        long discount = discounts.discountFor(subtotal);
        return new Quote(List.copyOf(lines), subtotal, discount, subtotal - discount);
    }
}
